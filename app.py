from flask import Flask, request, jsonify
from ingest.api import ingest_bp
from qa.index_loader import load_index, retrieve_context, extract_documents_by_page
from ollama_llm import get_answer_with_safety_check, get_available_models, DEFAULT_MODEL, OLLAMA_API_URL
import os, difflib, re
from typing import Optional, List, Dict, Any

app = Flask(__name__)
app.register_blueprint(ingest_bp, url_prefix='/api/ingest')

INDEX_DIR = "indices"
DOCUMENTS_DIR = "documents"

available_models = get_available_models()
current_model = DEFAULT_MODEL
model_status = "available" if current_model else "not configured"

print(f"Current LLM model: {current_model if current_model else 'None'}")
print(f"Available models: {', '.join(available_models) if available_models else 'None'}")

try:
    if os.path.exists(INDEX_DIR):
        index = load_index(os.path.join(INDEX_DIR, "index"))
        print(f"Successfully loaded index from {INDEX_DIR}")
    else:
        print(f"Warning: Index directory {INDEX_DIR} not found")
        index = None

    if os.path.exists(DOCUMENTS_DIR):
        filenames = os.listdir(DOCUMENTS_DIR)
        print(f"Found {len(filenames)} documents in {DOCUMENTS_DIR}")
    else:
        print(f"Warning: Documents directory {DOCUMENTS_DIR} not found")
        filenames = []
except Exception as e:
    print(f"Error loading index or documents: {str(e)}")
    index = None
    filenames = []

def pick_source_filename(question: str, filenames: list[str]) -> Optional[str]:
    if not filenames:
        return None

    bases = [os.path.splitext(f)[0] for f in filenames]
    q_lower = question.lower()
    
    # First try exact matches in the query
    for base, full in zip(bases, filenames):
        # Check for exact filename match (without extension)
        if base.lower() in q_lower:
            return full
    
    # Try to handle variations and misspellings
    # Split query into words to find partial matches
    words = q_lower.split()
    for base, full in zip(bases, filenames):
        base_lower = base.lower()
        # Try to catch partial matches and variations
        for word in words:
            # If the word is at least 70% similar to the filename
            if len(word) > 3 and (word in base_lower or base_lower in word):
                similarity = difflib.SequenceMatcher(None, word, base_lower).ratio()
                if similarity > 0.7:
                    return full
    
    # If no match found, use difflib for closest match
    match = difflib.get_close_matches(q_lower, bases, n=1, cutoff=0.5)
    if match:
        return filenames[bases.index(match[0])]
    
    return None

def extract_page_number(question: str) -> Optional[int]:
    """Extract page number from question if present with enhanced pattern matching"""
    # Look for patterns like "page 5", "page number 5", "p. 5", "pg 5", "paage 5" etc.
    patterns = [
        r'p(?:age|g|aage)\.?\s*(?:number)?\s*(\d+)',  # Handles page, pg, p., paage
        r'on\s+p(?:age|g|aage)\s+(\d+)',              # Handles "on page X"
        r'from\s+p(?:age|g|aage)\s+(\d+)',            # Handles "from page X"
        r'at\s+p(?:age|g|aage)\s+(\d+)',              # Handles "at page X"
        r'in\s+p(?:age|g|aage)\s+(\d+)',              # Handles "in page X"
        r'content\s+(?:of|from|on)\s+p(?:age|g|aage)\s+(\d+)'  # "content of page X"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, question.lower())
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                pass
    return None

def format_as_paragraph(text: str) -> str:
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'[*+•\-]\s+', '', text)
    text = re.sub(r'[`*_]+', '', text)
    text = re.sub(r'^Based on .*?:\s*', '', text)
    text = text.replace('\n', ' ')

    sections = [
        'General Information', 'Address Details', 'Application Requirements',
        'Fees and Payment Details', 'Dispatch and Collection Procedure',
        'Contact Information', 'Additional Information'
    ]
    for sec in sections:
        text = re.sub(rf'\b{sec}\b(?!:)', rf'{sec}:', text)

    text = re.sub(r'\s{2,}', ' ', text).strip()
    return text

def should_simplify_answer(question: str) -> bool:
    simplify_keywords = [
        "simple", "simplified", "simplify", "easy", "basics", 
        "explain simply", "explain in simple terms", "layman's terms",
        "beginner", "dumb it down", "easy to understand", "simpler way",
        "explain like I'm", "eli5", "simple way", "simple explanation","easy to understand",
        "easy way","simple language","simple way","easy understandable way"
    ]
    question_lower = question.lower()
    return any(keyword in question_lower for keyword in simplify_keywords)

def retrieve_page_content_with_fallback(source: str, page_number: int) -> List[Dict[str, Any]]:
    """
    Advanced function to retrieve content from a specific page with multiple strategies
    Returns organized chunks with metadata
    """
    if not index or not source or page_number is None:
        return []
    
    results = []
    
    # Method 1: Use the dedicated extract_documents_by_page function
    page_docs = extract_documents_by_page(index, source, page_number)
    
    if page_docs:
        for doc in page_docs:
            results.append({
                "text": doc.page_content,
                "metadata": doc.metadata,
                "source": source,
                "page": page_number
            })
        print(f"[DEBUG] Found {len(results)} page documents using extract_documents_by_page")
        return results
    
    # Method 2: Direct page retrieval with high k value and explicit page query
    try:
        direct_query = f"page {page_number} content from {os.path.splitext(source)[0]}"
        chunks = retrieve_context(index, direct_query, k=15, source=source, page_number=page_number)
        
        # Get metadata for each chunk through similarity search
        if chunks:
            docs = index.similarity_search(direct_query, k=30)
            exact_page_docs = [d for d in docs if d.metadata.get("source") == source and 
                              d.metadata.get("page_number") == page_number]
            
            if exact_page_docs:
                for doc in exact_page_docs:
                    results.append({
                        "text": doc.page_content,
                        "metadata": doc.metadata,
                        "source": source,
                        "page": page_number
                    })
                print(f"[DEBUG] Found {len(results)} results using direct page query")
                return results
    except Exception as e:
        print(f"[DEBUG] Error with direct page query: {e}")
    
    # Method 3: Scan through all documents filtering by metadata
    try:
        all_documents = index.similarity_search(f"{os.path.splitext(source)[0]}", k=200)
        exact_matches = [d for d in all_documents if 
                         d.metadata.get("source") == source and 
                         d.metadata.get("page_number") == page_number]
        
        if exact_matches:
            for doc in exact_matches:
                results.append({
                    "text": doc.page_content,
                    "metadata": doc.metadata,
                    "source": source,
                    "page": page_number
                })
            print(f"[DEBUG] Found {len(results)} results using metadata scan")
            return results
    except Exception as e:
        print(f"[DEBUG] Error with metadata scan: {e}")
    
    # Method 4: Extremely broad search as last resort
    try:
        # Get a large number of chunks and filter manually
        broader_query = " "  # Empty query to get a variety of documents
        docs = index.similarity_search(broader_query, k=300)
        exact_matches = [d for d in docs if 
                         d.metadata.get("source") == source and 
                         d.metadata.get("page_number") == page_number]
        
        if exact_matches:
            for doc in exact_matches:
                results.append({
                    "text": doc.page_content,
                    "metadata": doc.metadata,
                    "source": source,
                    "page": page_number
                })
            print(f"[DEBUG] Found {len(results)} results using broad search")
            return results
    except Exception as e:
        print(f"[DEBUG] Error with broad search: {e}")
    
    return results

@app.route('/api/exact-page-content', methods=['POST'])
def get_exact_page_content():
    """New endpoint specifically for retrieving exact page content"""
    data = request.get_json()
    document_name = data.get("document")
    page_number = data.get("page")
    format_text = data.get("format", False)  # Optional formatting parameter
    
    if not document_name or page_number is None:
        return jsonify({"error": "Document name and page number are required"}), 400
    
    if index is None:
        return jsonify({
            "error": "Document index not loaded. Please check your configuration.",
        }), 500
    
    try:
        print(f"[DEBUG] Retrieving exact content from {document_name}, page {page_number}")
        
        # Use the enhanced retrieval function
        page_chunks = retrieve_page_content_with_fallback(document_name, page_number)
        
        if not page_chunks:
            return jsonify({
                "error": f"No content found for page {page_number} in document {document_name}",
                "source": document_name,
                "page": page_number
            }), 404
        
        # Extract just the text content
        raw_chunks = [chunk["text"] for chunk in page_chunks]
        
        # Join the chunks into a single text block
        raw_text = "\n\n".join(raw_chunks)
        
        # Format if requested
        if format_text:
            # Minimal formatting to make it readable but preserve structure
            raw_text = re.sub(r'\s{3,}', '\n\n', raw_text)  # Convert large spaces to paragraphs
            raw_text = re.sub(r'\s{2,}', ' ', raw_text)     # Convert double spaces to single
            raw_text = raw_text.replace('\t', ' ')          # Convert tabs to spaces
        
        return jsonify({
            "content": raw_text,
            "chunks": raw_chunks,
            "source": document_name,
            "page": page_number
        }), 200
    except Exception as e:
        error_msg = f"Error retrieving exact page content: {str(e)}"
        print(error_msg)
        return jsonify({
            "error": error_msg,
            "source": document_name,
            "page": page_number
        }), 500

@app.route('/api/raw-page-content', methods=['POST'])
def get_raw_page_content():
    """Endpoint to retrieve raw text content from a specific document page"""
    data = request.get_json()
    document_name = data.get("document")
    page_number = data.get("page")
    
    if not document_name or page_number is None:
        return jsonify({"error": "Document name and page number are required"}), 400
    
    if index is None:
        return jsonify({
            "error": "Document index not loaded. Please check your configuration.",
        }), 500
    
    try:
        print(f"[DEBUG] Retrieving raw content from {document_name}, page {page_number}")
        # Retrieve more chunks to get more complete page content
        page_chunks = retrieve_page_content_with_fallback(document_name, page_number)
        
        if not page_chunks:
            # Try one more approach - direct context retrieval
            raw_chunks = retrieve_context(index, "", k=20, source=document_name, page_number=page_number)
            if not raw_chunks or not any(raw_chunks):
                return jsonify({
                    "error": f"No content found for page {page_number} in document {document_name}",
                    "source": document_name,
                    "page": page_number
                }), 404
            return jsonify({
                "content": raw_chunks,
                "source": document_name,
                "page": page_number
            }), 200
        
        # Extract just the text content if we have page chunks
        raw_chunks = [chunk["text"] for chunk in page_chunks]
        
        # Return the raw text chunks without processing
        return jsonify({
            "content": raw_chunks,
            "source": document_name,
            "page": page_number
        }), 200
    except Exception as e:
        error_msg = f"Error retrieving raw content: {str(e)}"
        print(error_msg)
        return jsonify({
            "error": error_msg,
            "source": document_name,
            "page": page_number
        }), 500

@app.route('/api/ask-question', methods=['POST'])
def ask_question():
    data = request.get_json()
    question = data.get("question", "").strip()
    raw_text_mode = data.get("raw_text", False)  # Parameter for raw text mode
    exact_page_mode = data.get("exact_page", False)  # New parameter for exact page content
    
    if not question:
        return jsonify({"error": "No question provided"}), 400

    if not current_model and not (raw_text_mode or exact_page_mode):
        models_msg = f"Available models: {', '.join(available_models)}" if available_models else "No models available"
        return jsonify({
            "answer": f"No LLM model configured. Please install a model with 'ollama pull <model_name>' and restart the service. {models_msg}",
            "source": None
        }), 500

    if index is None:
        return jsonify({
            "answer": "Document index not loaded. Please check your configuration.",
            "source": None
        }), 500

    source = pick_source_filename(question, filenames)
    page_number = extract_page_number(question)

    try:
        print(f"[DEBUG] Received question: {question}")
        print(f"[DEBUG] Identified source: {source}")
        print(f"[DEBUG] Extracted page number: {page_number}")
        print(f"[DEBUG] Raw text mode: {raw_text_mode}")
        print(f"[DEBUG] Exact page mode: {exact_page_mode}")
        
        # Enhanced check for page content request with broader patterns
        is_page_content_request = page_number is not None and (
            re.search(r'(what|show|tell|give|display).*(on|in|at|from)\s+page', question.lower()) or
            "page content" in question.lower() or
            "content of page" in question.lower() or
            "text on page" in question.lower() or
            "text from page" in question.lower() or
            "what is on page" in question.lower() or
            "what's on page" in question.lower() or
            exact_page_mode or
            (page_number and not re.search(r'(explain|describe|summarize|analyze)', question.lower()))
        )
        
        # If explicitly requesting page content, use the dedicated function
        if page_number is not None and source:
            print(f"[DEBUG] Processing page-specific request for page {page_number}")
            
            # Get page-specific content with improved function
            page_chunks = retrieve_page_content_with_fallback(source, page_number)
            
            # If no content found, try a direct lookup using the query
            if not page_chunks:
                # Try direct context retrieval as last resort
                raw_chunks = retrieve_context(index, f"page {page_number} of {source}", k=15, 
                                            source=source, page_number=page_number)
                
                if raw_chunks and any(raw_chunks):
                    page_content = "\n\n".join(raw_chunks)
                else:
                    error_msg = f"I couldn't find any content from page {page_number} of {source}. Please check if this page exists in the document or try another page number."
                    return jsonify({
                        "answer": error_msg,
                        "source": source,
                        "page": page_number
                    }), 404
            else:
                # Extract raw chunks from page_chunks
                raw_chunks = [chunk["text"] for chunk in page_chunks]
                page_content = "\n\n".join(raw_chunks)
            
            # If user wants raw text or it's explicitly a page content request
            if raw_text_mode or is_page_content_request:
                # Clean up the text to make it more readable
                page_content = re.sub(r'\s{3,}', '\n\n', page_content)
                page_content = re.sub(r'\s{2,}', ' ', page_content)
                
                return jsonify({
                    "answer": page_content,
                    "source": source,
                    "page": page_number,
                    "exact_page": True
                }), 200
            
            # For regular questions about page content that need LLM processing
            simplified_mode = should_simplify_answer(question)
            verbatim_keywords = ["exact text", "verbatim", "what exactly", "word for word", "precise text"]
            verbatim_mode = any(keyword in question.lower() for keyword in verbatim_keywords)
            
            # Format prompt based on the question type
            if verbatim_mode:
                prompt = (
                    f"You are a document transcription assistant. Provide VERBATIM text from page {page_number} of {source}, exactly as it appears.\n\n"
                    f"Page {page_number} content:\n\n{page_content}\n\n"
                    f"Question: {question}\n\n"
                    "Output the EXACT TEXT without modifications or summaries. Maintain original formatting where possible."
                )
            elif simplified_mode:
                prompt = (
                    f"You are explaining content from page {page_number} of {source} in SIMPLE, CLEAR language.\n\n"
                    f"Page {page_number} content:\n\n{page_content}\n\n"
                    f"Question: {question}\n\n"
                    "Provide a SIMPLIFIED explanation of this page content using plain language, avoiding jargon, "
                    "and focusing on the most important points. Use short sentences and everyday examples."
                )
            else:
                prompt = (
                    f"You are analyzing content from page {page_number} of {source}.\n\n"
                    f"Page {page_number} content:\n\n{page_content}\n\n"
                    f"Question: {question}\n\n"
                    "Provide a detailed answer focusing SPECIFICALLY on the content from this page. "
                    "Include all relevant details from the page content."
                )
            
            # Get answer using LLM
            answer = get_answer_with_safety_check(prompt)
            
            if not answer or not answer.strip():
                return jsonify({
                    "answer": f"I found content on page {page_number}, but couldn't generate a proper response. Here's the raw content: {page_content[:300]}...",
                    "source": source,
                    "page": page_number
                }), 200
            
            # Skip formatting for verbatim mode
            if verbatim_mode:
                cleaned_answer = answer
            else:
                cleaned_answer = format_as_paragraph(answer)
                
            return jsonify({
                "answer": cleaned_answer,
                "source": source,
                "page": page_number,
                "verbatim": verbatim_mode
            }), 200
            
        # Standard context retrieval for regular questions (non-page specific)
        chunks = retrieve_context(index, question, k=6, source=source, page_number=None)
        print(f"[DEBUG] Retrieved {len(chunks)} context chunks")

        if not chunks or not any(chunks):
            raise Exception("Context retrieval returned empty results.")

        # If raw text mode is enabled, skip LLM processing
        if raw_text_mode:
            joined_text = "\n\n".join(chunks)
            return jsonify({
                "answer": joined_text,
                "source": source,
                "page": None,
                "raw": True
            }), 200

        # Otherwise, proceed with normal LLM processing
        src_label = source or "all documents"
        simplified_mode = should_simplify_answer(question)
        print(f"[DEBUG] Simplified mode: {simplified_mode}")

        # Check if the query is specifically asking for exact text or content
        verbatim_keywords = ["exact text", "verbatim", "what exactly", "word for word", "precise text", 
                            "literal text", "exactly as written", "direct quote", "raw text"]
        verbatim_mode = any(keyword in question.lower() for keyword in verbatim_keywords)
        
        if verbatim_mode:
            # Use verbatim prompt for exact text requests
            prompt = (
                f"You are a document transcription assistant. Your job is to provide VERBATIM text from {src_label}.\n\n"
                f"Document content:\n\n{' '.join(chunks)}\n\n"
                f"Question: {question}\n\n"
                "Output the EXACT TEXT from the document without modifications, summaries, or your own interpretations. "
                "Maintain original formatting where possible."
            )
        elif simplified_mode:
            # Use simplified prompt for simple language requests
            prompt = (
                f"You are explaining content from {src_label} in SIMPLE, CLEAR language.\n\n"
                f"Document content:\n\n{' '.join(chunks)}\n\n"
                f"Question: {question}\n\n"
                "Provide a SIMPLIFIED explanation using plain language, avoiding jargon, "
                "and focusing on the most important points. Use short sentences and everyday examples."
            )
        else:
            # Standard prompt for regular questions
            prompt = (
                f"You are a document question-answering assistant. Answer the question based on content from {src_label}.\n\n"
                f"Document content:\n\n{' '.join(chunks)}\n\n"
                f"Question: {question}\n\n"
                "Provide a detailed, accurate answer based strictly on the document content. "
                "Don't include information not found in the document."
            )
        
        # Get answer using LLM
        answer = get_answer_with_safety_check(prompt)
        
        if not answer or not answer.strip():
            return jsonify({
                "answer": "I couldn't generate a proper response based on the provided document. Please try rephrasing your question.",
                "source": source,
                "page": None
            }), 500
        
        # Skip formatting for verbatim mode
        if verbatim_mode:
            cleaned_answer = answer
        else:
            cleaned_answer = format_as_paragraph(answer)
            
        return jsonify({
            "answer": cleaned_answer,
            "source": source,
            "page": page_number if page_number else None,
            "verbatim": verbatim_mode
        }), 200
        
    except Exception as e:
        error_msg = f"Error processing question: {str(e)}"
        print(error_msg)
        return jsonify({
            "answer": f"An error occurred: {error_msg}",
            "source": source,
            "page": page_number if page_number else None
        }), 500

@app.route('/api/available-models', methods=['GET'])
def get_models():
    """Endpoint to get all available LLM models"""
    return jsonify({
        "available_models": available_models,
        "current_model": current_model,
        "status": model_status
    }), 200

@app.route('/api/select-model', methods=['POST'])
def select_model():
    """Endpoint to select and use a different LLM model"""
    global current_model, model_status
    
    data = request.get_json()
    model_name = data.get("model")
    
    if not model_name:
        return jsonify({"error": "No model name provided"}), 400
    
    if model_name not in available_models:
        return jsonify({
            "error": f"Model {model_name} not available. Please install it with 'ollama pull {model_name}'",
            "available_models": available_models
        }), 404
    
    # Update the current model
    current_model = model_name
    model_status = "available"
    
    print(f"Switched to model: {current_model}")
    
    return jsonify({
        "message": f"Successfully switched to model: {current_model}",
        "current_model": current_model,
        "status": model_status
    }), 200

@app.route('/api/document-list', methods=['GET'])
def get_document_list():
    """Endpoint to get the list of indexed documents"""
    try:
        # Refresh the filenames list from the documents directory every time
        global filenames
        if os.path.exists(DOCUMENTS_DIR):
            filenames = os.listdir(DOCUMENTS_DIR)
            print(f"[DEBUG] Refreshed document list: {len(filenames)} documents found")
        else:
            filenames = []
        
        if not filenames:
            return jsonify({
                "message": "No documents found",
                "documents": []
            }), 200
        
        return jsonify({
            "message": f"Found {len(filenames)} documents",
            "documents": filenames
        }), 200
    except Exception as e:
        return jsonify({
            "error": f"Error retrieving document list: {str(e)}",
            "documents": []
        }), 500
        
@app.route('/api/system-status', methods=['GET'])
def get_system_status():
    """Endpoint to get the overall system status"""
    try:
        return jsonify({
            "index_status": "loaded" if index else "not loaded",
            "documents_found": len(filenames) if filenames else 0,
            "model_status": model_status,
            "current_model": current_model,
            "available_models": available_models,
            "ollama_url": OLLAMA_API_URL
        }), 200
    except Exception as e:
        return jsonify({
            "error": f"Error retrieving system status: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)