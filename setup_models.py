#!/usr/bin/env python3
"""
Setup script to check and install Ollama models
"""

import requests
import subprocess
import sys
import os
import platform
import time

OLLAMA_API_URL = os.environ.get("OLLAMA_API_URL", "http://localhost:11434/api")

def print_header(text):
    """Print a formatted header"""
    print("\n" + "=" * 60)
    print(f" {text}")
    print("=" * 60)

def check_ollama_running():
    """Check if Ollama is running by making a simple API request"""
    try:
        response = requests.get(f"{OLLAMA_API_URL}/tags", timeout=5)
        return response.status_code == 200
    except Exception:
        return False

def start_ollama():
    """Attempt to start Ollama based on the current platform"""
    system = platform.system().lower()
    
    if system == "linux" or system == "darwin":  # Linux or macOS
        print("Attempting to start Ollama...")
        subprocess.Popen(["ollama", "serve"], 
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE)
    elif system == "windows":
        print("Attempting to start Ollama...")
        subprocess.Popen(["ollama", "serve"],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        shell=True)
    else:
        print(f"Unsupported platform: {system}")
        return False
    
    # Wait for Ollama to start
    for _ in range(10):
        print("Waiting for Ollama to start...")
        time.sleep(2)
        if check_ollama_running():
            return True
    
    return False

def get_available_models():
    """Get a list of available models from Ollama API"""
    try:
        response = requests.get(f"{OLLAMA_API_URL}/tags")
        if response.status_code == 200:
            models_data = response.json().get("models", [])
            return [model.get("name") for model in models_data if model.get("name")]
        return []
    except Exception as e:
        print(f"Error fetching available models: {str(e)}")
        return []

def install_model(model_name):
    """Install a model using the ollama command line"""
    print(f"Installing model: {model_name}")
    try:
        # Use subprocess.run with check=True to raise an exception if the command fails
        result = subprocess.run(["ollama", "pull", model_name], 
                           stdout=subprocess.PIPE, 
                           stderr=subprocess.PIPE,
                           text=True,
                           check=True)
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error installing model: {e.stderr}")
        return False
    except Exception as e:
        print(f"Error: {str(e)}")
        return False

def main():
    print_header("OLLAMA SETUP ASSISTANT")
    
    # Check if Ollama is installed
    try:
        version_output = subprocess.check_output(["ollama", "version"], 
                                               stderr=subprocess.STDOUT,
                                               text=True)
        print(f"Ollama is installed: {version_output.strip()}")
    except (subprocess.SubprocessError, FileNotFoundError):
        print("Ollama is not installed or not in PATH.")
        print("Please install Ollama from https://ollama.com/download")
        sys.exit(1)
    
    # Check if Ollama is running
    if not check_ollama_running():
        print("Ollama service is not running.")
        if not start_ollama():
            print("Could not start Ollama automatically.")
            print("Please start Ollama manually with 'ollama serve' in a separate terminal.")
            sys.exit(1)
        else:
            print("Successfully started Ollama service.")
    else:
        print("Ollama service is running.")
    
    # Get available models
    available_models = get_available_models()
    if available_models:
        print("\nCurrent models installed:")
        for i, model in enumerate(available_models, 1):
            print(f"  {i}. {model}")
    else:
        print("\nNo models are currently installed.")
    
    # Recommended models
    print_header("RECOMMENDED MODELS")
    recommended_models = [
        "llama3", "llama2", "mistral", "phi", "gemma", "orca", "codellama"
    ]
    
    # Find the smallest variants of each model type
    available_models_lower = [m.lower() for m in available_models]
    
    for base_model in recommended_models:
        # Check if any variant of this model is already installed
        if any(base_model in m for m in available_models_lower):
            variants = [m for m in available_models if base_model.lower() in m.lower()]
            print(f"✓ {base_model} model installed: {', '.join(variants)}")
            continue
        
        # If not installed, ask if user wants to install it
        print(f"\nInstall {base_model} model?")
        choice = input("Enter 'y' to install or any other key to skip: ").strip().lower()
        
        if choice == 'y':
            success = install_model(base_model)
            if success:
                print(f"Successfully installed {base_model} model.")
            else:
                print(f"Failed to install {base_model} model.")
    
    # Updated list of available models
    available_models = get_available_models()
    
    if available_models:
        print_header("INSTALLATION COMPLETE")
        print("Available models:")
        for model in available_models:
            print(f"  - {model}")
        print("\nYou can now run your application with one of these models.")
        print("Example: export OLLAMA_MODEL=\"llama3\" && python app.py")
    else:
        print_header("NO MODELS INSTALLED")
        print("You need at least one model to use the application.")
        print("Please install a model with: ollama pull <model_name>")
    
    print("\nSetup complete!")

if __name__ == "__main__":
    main()