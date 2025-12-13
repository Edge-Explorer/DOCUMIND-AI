# qa/index_loader.py

from langchain.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.schema import Document
from typing import List, Optional, Dict, Any, Tuple
import os
import re

# Add error handling for embedding model initialization
try:
    embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
except Exception as e:
    print(f"Error initializing embedding model: {str(e)}")
    # Fall back to a simpler model if available
    try:
        embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")
    except:
        print("Failed to initialize alternative embedding model")
        embedding_model = None

def load_index(path: str) -> FAISS:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Index path not found: {path}")
    
    if embedding_model is None:
        raise ValueError("Embedding model not initialized properly")
        
    return FAISS.load_local(path, embedding_model)

def extract_documents_by_page(index: FAISS, source: str, page_number: int, min_results: int = 5) -> List[Document]:
    """
    Enhanced function to extract documents from a specific page using multiple search strategies
    """
    if not index:
        return []
    
    # Collection of document retrieval strategies
    retrieval_strategies = [
        # Strategy 1: Direct page query with source name
        lambda: index.similarity_search(f"content from page {page_number} of {os.path.splitext(source)[0]}", k=30),
        
        # Strategy 2: Content query focusing on the page number explicitly
        lambda: index.similarity_search(f"page {page_number}", k=30),
        
        # Strategy 3: Broad document query to get many chunks
        lambda: index.similarity_search(f"document {os.path.splitext(source)[0]}", k=50),
        
        # Strategy 4: Document name only to find all chunks
        lambda: index.similarity_search(f"{os.path.splitext(source)[0]}", k=50),
        
        # Strategy 5: Empty query to get a variety of document chunks
        lambda: index.similarity_search(" ", k=100)
    ]
    
    all_docs = []
    for strategy in retrieval_strategies:
        try:
            docs = strategy()
            # Filter to matching source and page
            filtered_docs = [d for d in docs if d.metadata.get("source") == source and 
                             d.metadata.get("page_number") == page_number]
            all_docs.extend(filtered_docs)
            
            # If we have enough results, we can stop trying additional strategies
            if len(all_docs) >= min_results:
                break
        except Exception as e:
            print(f"[DEBUG] Retrieval strategy error: {e}")
            continue
    
    # If we still don't have enough results, try a direct approach by scanning all documents
    if len(all_docs) < min_results:
        try:
            # This is computationally expensive but a good fallback
            # Get a large number of documents from the index
            all_documents = index.similarity_search(" ", k=500)
            # Filter exactly by source and page number
            filtered_docs = [d for d in all_documents if 
                             d.metadata.get("source") == source and 
                             d.metadata.get("page_number") == page_number]
            # Add any that weren't already found
            for doc in filtered_docs:
                if doc not in all_docs:
                    all_docs.append(doc)
        except Exception as e:
            print(f"[DEBUG] Direct document scan error: {e}")
    
    # Remove duplicates while preserving order
    seen = set()
    unique_docs = []
    for doc in all_docs:
        if doc.page_content not in seen:
            seen.add(doc.page_content)
            unique_docs.append(doc)
    
    print(f"[DEBUG] Found {len(unique_docs)} unique document chunks for page {page_number} in {source}")
    return unique_docs

def retrieve_context(
    index: FAISS,
    query: str,
    k: int = 6,
    source: Optional[str] = None,
    page_number: Optional[int] = None
) -> List[str]:
    """
    Enhanced context retrieval with STRICT source filtering.
    Returns the top-k relevant document chunks ONLY from the specified source.
    """
    try:
        # First, check if this is specifically a page content retrieval
        if source and page_number is not None:
            # Use specialized page extraction 
            page_docs = extract_documents_by_page(index, source, page_number)
            if page_docs:
                return [d.page_content for d in page_docs[:k]]
        
        # If not a specific page request or no results found, proceed with general context retrieval
        
        # Check for page number in query if not explicitly provided
        if page_number is None and "page" in query.lower():
            page_match = re.search(r'page\s*(?:number)?\s*(\d+)', query.lower())
            if page_match:
                page_number = int(page_match.group(1))
                print(f"[DEBUG] Detected page number {page_number} in query")
                
            # Also look for paage, pg variants
            if not page_match:
                page_match = re.search(r'p(?:aa|a|g)ge\s*(?:number)?\s*(\d+)', query.lower())
                if page_match:
                    page_number = int(page_match.group(1))
                    print(f"[DEBUG] Detected alternative page number {page_number} in query")
        
        # ✅ CRITICAL FIX: If source is specified, ONLY retrieve from that source
        if source:
            print(f"[DEBUG] Strict source filtering enabled for: {source}")
            
            # Get a larger set of documents to ensure we have enough from the target source
            all_docs = index.similarity_search(query, k=50)
            
            # ✅ FILTER: Only keep documents from the specified source
            source_filtered_docs = [
                d for d in all_docs 
                if d.metadata.get('source') == source
            ]
            
            print(f"[DEBUG] Before filtering: {len(all_docs)} docs, After filtering: {len(source_filtered_docs)} docs from {source}")
            
            # If we don't have enough documents from this source, try additional queries
            if len(source_filtered_docs) < k:
                print(f"[DEBUG] Not enough docs from source, trying additional queries...")
                
                # Try multiple search strategies
                additional_queries = [
                    f"{os.path.splitext(source)[0]}",  # Just the filename
                    f"document {os.path.splitext(source)[0]}",  # With "document" prefix
                    f"content from {os.path.splitext(source)[0]}",  # With "content from" prefix
                    query  # Original query again with higher k
                ]
                
                for additional_query in additional_queries:
                    more_docs = index.similarity_search(additional_query, k=100)
                    more_filtered = [
                        d for d in more_docs 
                        if d.metadata.get('source') == source and d not in source_filtered_docs
                    ]
                    source_filtered_docs.extend(more_filtered)
                    
                    if len(source_filtered_docs) >= k:
                        break
                
                print(f"[DEBUG] After additional queries: {len(source_filtered_docs)} docs from {source}")
            
            # If we STILL don't have any documents from this source, something is wrong
            if not source_filtered_docs:
                print(f"[DEBUG] ERROR: No documents found with source={source}")
                print(f"[DEBUG] Available sources in index:")
                sample_docs = index.similarity_search(" ", k=20)
                unique_sources = set(d.metadata.get('source', 'NO_SOURCE') for d in sample_docs)
                for src in unique_sources:
                    print(f"[DEBUG]   - {src}")
                
                return [f"Error: No content found for document '{source}'. Please verify the document name."]
            
            # Apply page filtering if needed
            if page_number is not None:
                source_filtered_docs = [
                    d for d in source_filtered_docs 
                    if d.metadata.get('page_number') == page_number
                ]
                print(f"[DEBUG] After page filtering: {len(source_filtered_docs)} docs from page {page_number}")
            
            # Remove duplicates while preserving order
            seen = set()
            unique_docs = []
            for doc in source_filtered_docs:
                if doc.page_content not in seen:
                    seen.add(doc.page_content)
                    unique_docs.append(doc)
            
            # Return the top k chunks
            result = [d.page_content for d in unique_docs[:k]]
            print(f"[DEBUG] Returning {len(result)} chunks from {source}")
            return result
        
        # If no source specified, use original logic (all documents)
        print(f"[DEBUG] No source specified, searching all documents")
        
        content_queries = [
            query,
            "document content summary information details",
            "important fields values data information"
        ]
        
        all_docs = []
        for q in content_queries:
            docs = index.similarity_search(q, k=10)
            all_docs.extend(docs)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_docs = []
        for doc in all_docs:
            if doc.page_content not in seen:
                seen.add(doc.page_content)
                unique_docs.append(doc)
        
        # Return the top k chunks
        return [d.page_content for d in unique_docs[:k]]
        
    except Exception as e:
        print(f"Error retrieving context: {str(e)}")
        return [f"Error retrieving document context. Please check your query and try again."]