# Documind-AI 📄🧠

A local document Q\&A assistant that lets you upload files (PDF, DOCX, TXT) and ask natural language questions about their content — powered by LangChain, FAISS, and Ollama. Comes with a mobile-friendly React Native frontend.

---

## ⚙️ Features

* 📄 Supports PDF, DOCX, and TXT files
* 💬 Ask questions about any uploaded document
* 🧠 Powered by local LLMs (Ollama + LangChain)
* 🔍 Uses FAISS for semantic search
* 🖼️ OCR support via Tesseract for scanned files
* 📱 Mobile frontend built with React Native

---

## 🧠 Tech Stack

* **Backend**: Python (Flask), LangChain, FAISS, Tesseract OCR, Ollama (Gemma, Mistral, etc.)
* **Frontend**: React Native (Expo)

---

## 📁 Modules

* `app.py` – Flask backend entry point
* `ollama_llm.py` – LangChain-compatible wrapper for Ollama
* `utils.py` – File and preprocessing utilities
* `document/` – Stores uploaded files
* `index_store/` – Stores FAISS indexes
* `frontend/` – React Native mobile app source

---

## 🧪 Input

* MNIST-like user interaction: User uploads a document → App processes and indexes it → User can ask questions.

Supported formats:

* 📄 `.pdf`, `.docx`, `.txt`
* 🖼️ OCR-enabled `.pdf` (scanned)

---

## 🚀 Goal

To build a fast, offline-capable document assistant that runs entirely on your machine, ensuring both privacy and performance without relying on cloud APIs.





