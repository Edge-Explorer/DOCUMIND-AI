# Documind-AI 📄🧠

A local document Q\&A assistant that lets you upload files (PDF, DOCX, TXT) and ask natural language questions about their content — powered by LangChain, FAISS, and Ollama.

---

## ⚙️ Features

* Multi-format document support (PDF, DOCX, TXT)
* LLM-based Q\&A using Ollama (local models like Gemma)
* OCR support for scanned/image-based documents
* Embedding and indexing with LangChain + FAISS
* Fast, context-aware natural language answers
* Electron-based cross-platform frontend

---

## 🧠 Tech Stack

* Python (Flask Backend)
* React + TypeScript (Electron Frontend)
* LangChain, FAISS
* Ollama (Local LLMs)
* Tesseract OCR (for scanned files)

---

## 📁 Modules

* `app.py` – Flask backend entry point
* `generate.py` – Query handling and response generation
* `ollama_llm.py` – Custom wrapper for Ollama LLM
* `utils.py` – Utilities for file management
* `document/` – Uploaded document store
* `frontend/` – React + Electron frontend
* `index_store/` – FAISS vector database

---

## 🧪 Dataset / Input

* User-uploaded documents (PDF, DOCX, TXT)
* Optional scanned images (OCR support enabled)

---

## 🚀 Goal

To build a private, fast, and interactive assistant that can understand and respond to user queries based on uploaded documents — without relying on external APIs or cloud-hosted models.



