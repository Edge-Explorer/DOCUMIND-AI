# DOCUMIND-AI

## Intelligent Offline Document Q&A Assistant

DOCUMIND-AI is an AI-powered **offline document question-answering system** that allows users to upload documents and ask natural language questions about their content. The system uses **Retrieval-Augmented Generation (RAG)** with local LLMs to ensure **privacy, low latency, and zero dependency on cloud APIs**.

This project focuses on **practical AI engineering**: document ingestion, semantic search, OCR, vector indexing, and end-to-end system integration.

---

## 🚀 Key Features

* 📄 Upload and process **PDF, DOCX, and TXT** documents
* 🔍 Semantic search using **FAISS vector database**
* 🧠 Context-aware Q&A using **local LLMs (Ollama)**
* 🖼️ OCR support for **scanned PDFs** using Tesseract
* 🔒 Fully **offline & privacy-first** architecture
* 📱 Mobile-friendly frontend built with **React Native (Expo)**

---

## 🧠 System Architecture

1. **Document Ingestion**
   Uploaded documents are parsed and split into chunks.

2. **OCR Processing**
   Scanned PDFs are processed using Tesseract OCR to extract text.

3. **Embedding & Indexing**
   Text chunks are converted into embeddings and stored in a **FAISS index**.

4. **Query Processing**
   User queries are embedded and matched against the FAISS index.

5. **LLM Response Generation**
   Relevant document context is passed to a local LLM via **LangChain + Ollama**.

---

## 🧩 Tech Stack

### Backend

* Python
* Flask
* LangChain
* FAISS
* Ollama (local LLM runtime)
* Tesseract OCR

### Frontend

* React Native
* Expo

---

## 📂 Project Structure

```
DOCUMIND-AI/
│
├── app.py                 # Flask backend entry point
├── ollama_llm.py          # Local LLM wrapper (Ollama + LangChain)
├── setup_models.py        # Script to setup required local models
├── utils.py               # Helper functions (OCR, embeddings, file handling)
│
├── document/              # Uploaded documents
├── index_store/           # FAISS vector indexes
│
├── frontend/              # React Native mobile application
│
├── requirements.txt       # Python dependencies
├── README.md              # Project documentation
└── LICENSE                # MIT License
```

---

## 📊 Design Decisions

* **FAISS** was chosen for fast, in-memory vector similarity search.
* **Local LLMs (Ollama)** ensure data privacy and offline usability.
* **LangChain** simplifies RAG pipeline orchestration.
* **OCR integration** enables handling of real-world scanned documents.

---

## 📈 Performance Notes

* Average query latency depends on model size and hardware
* Optimized for **single-user, local inference**
* Suitable for personal research, study, and document analysis

---

## 🎯 Use Cases

* Academic research paper analysis
* Resume and document review
* Legal or policy document exploration
* Personal knowledge base creation

---

## 🔮 Future Improvements

* Add unit and integration tests
* Improve chunking and retrieval accuracy
* Support multi-document conversation memory
* Add admin dashboard for document management
* Deploy backend as a containerized service

---

## 🧑‍💻 Author

**Karan Shelar**
GitHub: [https://github.com/Edge-Explorer](https://github.com/Edge-Explorer)

---

## 📜 License

This project is licensed under the MIT License.



