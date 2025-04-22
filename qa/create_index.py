from langchain_community.document_loaders import TextLoader
from langchain_community.text_splitter import CharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
import os

# 1) Load each document and add metadata
docs = []
for filename in os.listdir("documents"):
    if filename.endswith((".pdf", ".txt", ".docx")):
        loader = TextLoader(os.path.join("documents", filename))
        chunks = CharacterTextSplitter(chunk_size=1000).split_documents(loader.load())
        for chunk in chunks:
            chunk.metadata["source"] = filename
        docs.extend(chunks)

# 2) Create & save the FAISS index
emb = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
index = FAISS.from_documents(docs, emb)
index.save_local("indices")
