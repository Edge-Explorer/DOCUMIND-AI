import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  StatusBar,
  Switch,
  ImageBackground,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';

const { width, height } = Dimensions.get('window');

const DOCUMIND_APP = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [source, setSource] = useState(null);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [serverStatus, setServerStatus] = useState('unknown');
  const [rawMode, setRawMode] = useState(false);
  const [exactPageMode, setExactPageMode] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [currentModel, setCurrentModel] = useState('');
  const [isDocumentModalVisible, setDocumentModalVisible] = useState(false);
  const [isModelModalVisible, setModelModalVisible] = useState(false);

// ✅ Define a fixed list of URLs — only using your IP
const SERVER_URLS = ['http://192.168.1.104:5000']; // Replace with your real IP

// ✅ Always index into this safely
const [currentServerUrlIndex, setCurrentServerUrlIndex] = useState(0);
const currentServerUrl = SERVER_URLS[currentServerUrlIndex] || SERVER_URLS[0]; // fallback to first if index is bad

// ✅ No-op function for compatibility
const tryAlternativeServerUrl = () => false;

  

  // Check server connection on app start and when server URL changes
  useEffect(() => {
    checkServerConnection();
  }, [currentServerUrlIndex]);

  useEffect(() => {
    if (serverStatus === 'connected') {
      fetchDocuments();
      fetchModels();
    }
  }, [serverStatus]);

  const checkServerConnection = async () => {
    setServerStatus('checking');
    try {
      console.log(`Checking server connection to ${currentServerUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${currentServerUrl}/api/system-status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setServerStatus('connected');
        console.log('Server connection successful!', data);
        
        // Set current model if available
        if (data.current_model) {
          setCurrentModel(data.current_model);
        }
      } else {
        setServerStatus('error');
        console.log('Server returned an error status');
        
        // Try alternative server URL
        if (tryAlternativeServerUrl()) {
          console.log('Trying alternative server URL...');
        }
      }
    } catch (exception) {
      console.error('Server connection exception:', exception);
      setServerStatus('error');
      
      // Check if the exception is an AbortError
      if (exception instanceof Error && exception.name === 'AbortError') {
        console.log('Connection timeout');
      }
      
      if (tryAlternativeServerUrl()) {
        console.log('Trying alternative server URL...');
      }
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${currentServerUrl}/api/document-list`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch(`${currentServerUrl}/api/available-models`);
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.available_models || []);
        if (data.current_model) {
          setCurrentModel(data.current_model);
        }
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const selectModel = async (modelName: string) => {
    try {
      const response = await fetch(`${currentServerUrl}/api/select-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelName }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentModel(data.current_model);
        Alert.alert('Success', `Switched to model: ${data.current_model}`);
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to switch model');
      }
    } catch (error) {
      console.error('Error selecting model:', error);
      Alert.alert('Error', 'Failed to connect to server');
    } finally {
      setModelModalVisible(false);
    }
  };

  const uploadDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'application/msword', 
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      
      if (result.canceled) {
        return;
      }
      
      // Get the first asset
      const file = result.assets[0];
      
      // Create FormData
      const formData = new FormData();
      // Use set method instead of append if append is causing issues
      formData.set('file', {
        uri: file.uri,
        type: file.mimeType,
        name: file.name,
      } as any);
      
      // Upload file
      const uploadDocument = async () => {
        try {
          const result = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'text/plain', 'application/msword', 
                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            copyToCacheDirectory: true,
          });
          
          if (result.canceled) {
            return;
          }
          
          // Get the first asset
          const file = result.assets[0];
          
          // Create FormData
          const formData = new FormData();
          formData.append('document', {
            uri: file.uri,
            type: file.mimeType,
            name: file.name,
          } as any);
          
          // Show loading indicator
          setLoading(true);
          
          // Upload file
          const uploadResponse = await fetch(`${currentServerUrl}/api/ingest/upload-document`, {
            method: 'POST',
            body: formData,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          
          if (uploadResponse.ok) {
            const responseData = await uploadResponse.json();
            Alert.alert('Success', `Uploaded ${file.name} successfully`);
            fetchDocuments(); // Refresh document list
          } else {
            // Try to get error message
            let errorMessage = 'Unknown error occurred';
            try {
              const errorData = await uploadResponse.json();
              errorMessage = errorData.error || errorMessage;
            } catch (parseError) {
              // If we can't parse JSON, get the text instead
              const errorText = await uploadResponse.text();
              errorMessage = errorText || errorMessage;
            }
            Alert.alert('Upload Failed', errorMessage);
          }
        } catch (error) {
          console.error('Document upload error:', error);
          Alert.alert('Error', 'Failed to upload document');
        } finally {
          setLoading(false);
        }
      };

      // Call the upload function
      uploadDocument();
    } catch (error) {
      console.error('Document upload error:', error);
      Alert.alert('Error', 'Failed to upload document');
    }
  };

  // Theme toggle function
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleSubmit = async () => {
    if (!question.trim()) {
      Alert.alert('Error', 'Please enter a question');
      return;
    }
    
    setLoading(true);
    setAnswer('');
    setSource(null);
    setPage(null);
    
    try {
      console.log(`Sending request to ${currentServerUrl}/api/ask-question`);
      
      // Set up timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 minute timeout
      
      const response = await fetch(`${currentServerUrl}/api/ask-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          question,
          raw_text: rawMode,
          exact_page: exactPageMode
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.answer) {
        setAnswer(data.answer);
        setSource(data.source);
        setPage(data.page);
      } else {
        setAnswer('Sorry, could not get an answer.');
      }
    } catch (exception) {
      console.error('Error submitting question:', exception);
      
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      // Check if exception is an AbortError
      if (exception instanceof Error && exception.name === 'AbortError') {
        errorMessage = 'Request timed out. The server might be busy processing your question.';
      } 
      // Check if it's another type of Error with a message property
      else if (exception instanceof Error && exception.message) {
        errorMessage = `Request failed: ${exception.message}`;
      }
      
      setAnswer(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearInput = () => {
    setQuestion('');
    setAnswer('');
    setSource(null);
    setPage(null);
  };

  // Retry connection button handler
  const handleRetryConnection = () => {
    checkServerConnection();
  };

  // Colors for light and dark modes
  const colors = {
    light: {
      background: 'rgba(245, 247, 250, 0.92)',
      primary: '#1976D2',
      secondary: '#42A5F5',
      text: '#333333',
      subtitleText: '#666666',
      inputBackground: 'rgba(255, 255, 255, 0.95)',
      inputText: '#333333',
      answerBackground: 'rgba(255, 255, 255, 0.95)',
      answerText: '#333333',
      sendButtonBg: '#1976D2',
      clearButtonBg: '#ff6b6b',
      headerBackground: '#1976D2',
      errorText: '#e53935',
      backgroundOverlay: 'rgba(255, 255, 255, 0.65)',
      switchBg: '#bbdefb',
      modalBackground: 'rgba(255, 255, 255, 0.95)',
      modalItemBg: '#f5f5f5',
      modalItemText: '#333333',
      modalHeader: '#1976D2',
      modalHeaderText: '#FFFFFF',
    },
    dark: {
      background: 'rgba(18, 18, 18, 0.88)',
      primary: '#1976D2',
      secondary: '#1E88E5',
      text: '#FFFFFF',
      subtitleText: '#BBBBBB',
      inputBackground: 'rgba(42, 42, 42, 0.95)',
      inputText: '#FFFFFF',
      answerBackground: 'rgba(30, 30, 30, 0.95)',
      answerText: '#FFFFFF',
      sendButtonBg: '#1976D2',
      clearButtonBg: '#B71C1C',
      headerBackground: '#0D47A1',
      errorText: '#ff6e6e',
      backgroundOverlay: 'rgba(0, 0, 0, 0.75)',
      switchBg: '#0d47a1',
      modalBackground: 'rgba(42, 42, 42, 0.95)',
      modalItemBg: '#333333',
      modalItemText: '#FFFFFF',
      modalHeader: '#0D47A1',
      modalHeaderText: '#FFFFFF',
    }
  };

  // Get current theme colors
  const currentColors = isDarkMode ? colors.dark : colors.light;

  // Render server status indicator
  const renderServerStatus = () => {
    let statusColor = '#999';
    let statusText = 'Checking server...';
    
    if (serverStatus === 'connected') {
      statusColor = '#4CAF50';
      statusText = 'Server connected';
    } else if (serverStatus === 'error') {
      statusColor = '#F44336';
      statusText = 'Server connection failed';
    } else if (serverStatus === 'unknown') {
      statusColor = '#FFC107';
      statusText = 'Server status unknown';
    }
    
    return (
      <View style={styles.serverStatusContainer}>
        <BlurView
          intensity={5}
          tint={isDarkMode ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.blurViewContent}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: currentColors.subtitleText }]}>
              {statusText}
            </Text>
          </View>
          
          {serverStatus === 'error' && (
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: currentColors.sendButtonBg }]} 
              onPress={handleRetryConnection}
            >
              <Text style={styles.retryButtonText}>Retry Connection</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Document Modal
  const renderDocumentModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDocumentModalVisible}
        onRequestClose={() => setDocumentModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={[styles.modalView, { backgroundColor: currentColors.modalBackground }]}>
            <Text style={[styles.modalTitle, { color: currentColors.modalHeaderText, backgroundColor: currentColors.modalHeader }]}>
              Available Documents
            </Text>
            
            {documents.length === 0 ? (
              <Text style={[styles.noDocumentsText, { color: currentColors.subtitleText }]}>
                No documents found
              </Text>
            ) : (
              <FlatList
                data={documents}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.documentItem, { backgroundColor: currentColors.modalItemBg }]}
                    onPress={() => {
                      setQuestion(prevQuestion => {
                        // Check if prevQuestion exists before calling toLowerCase
                        const prevLower = prevQuestion ? prevQuestion.toLowerCase() : "";
                        const itemLower = item ? item.toLowerCase() : "";
                        
                        // Append document name to query if not already there
                        if (!prevLower.includes(itemLower)) {
                          return prevQuestion + (prevQuestion ? ' ' : '') + item;
                        }
                        return prevQuestion;
                      });
                      setDocumentModalVisible(false);
                    }}
                  >
                    <FontAwesome5 name="file-alt" size={18} color={currentColors.primary} />
                    <Text style={[styles.documentName, { color: currentColors.modalItemText }]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                style={styles.documentList}
              />
            )}
            
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentColors.clearButtonBg }]}
                onPress={() => setDocumentModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentColors.sendButtonBg }]}
                onPress={uploadDocument}
              >
                <Text style={styles.modalButtonText}>Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Model Selection Modal
  const renderModelModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModelModalVisible}
        onRequestClose={() => setModelModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={[styles.modalView, { backgroundColor: currentColors.modalBackground }]}>
            <Text style={[styles.modalTitle, { color: currentColors.modalHeaderText, backgroundColor: currentColors.modalHeader }]}>
              Select LLM Model
            </Text>
            
            {availableModels.length === 0 ? (
              <Text style={[styles.noDocumentsText, { color: currentColors.subtitleText }]}>
                No models available
              </Text>
            ) : (
              <FlatList
                data={availableModels}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[
                      styles.modelItem, 
                      { 
                        backgroundColor: item === currentModel 
                          ? currentColors.primary 
                          : currentColors.modalItemBg 
                      }
                    ]}
                    onPress={() => selectModel(item)}
                  >
                    <Ionicons 
                      name={item === currentModel ? "checkmark-circle" : "ellipse-outline"} 
                      size={20} 
                      color={item === currentModel ? "#FFFFFF" : currentColors.primary} 
                    />
                    <Text 
                      style={[
                        styles.modelName, 
                        { 
                          color: item === currentModel 
                            ? "#FFFFFF" 
                            : currentColors.modalItemText,
                          fontWeight: item === currentModel ? 'bold' : 'normal'
                        }
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                style={styles.modelList}
              />
            )}
            
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: currentColors.clearButtonBg }]}
              onPress={() => setModelModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const backgroundImage = 'https://blog.showcaseworkshop.com/content/images/2018/02/shutterstock_734844433.jpg';

  return (
    <ImageBackground 
      source={{ uri: backgroundImage }} 
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={[styles.overlay, { backgroundColor: currentColors.backgroundOverlay }]} />
      <View style={[styles.container]}>
        <StatusBar 
          barStyle={isDarkMode ? "light-content" : "dark-content"} 
          backgroundColor={currentColors.headerBackground}
        />
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: currentColors.headerBackground }]}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.title}>Documind</Text>
              <Text style={styles.subtitle}>Document Question Answering</Text>
            </View>
            
            {/* Theme Toggle */}
            <View style={styles.themeToggleContainer}>
              <MaterialIcons name={isDarkMode ? "nightlight-round" : "wb-sunny"} size={24} color="#FFFFFF" />
              <Switch 
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: "#767577", true: currentColors.switchBg }}
                thumbColor={isDarkMode ? "#f5dd4b" : "#f4f3f4"}
                style={styles.themeSwitch}
              />
            </View>
          </View>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.mainContent}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Server Status */}
            {renderServerStatus()}
            
            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: currentColors.primary }]} 
                onPress={() => setDocumentModalVisible(true)}
              >
                <FontAwesome5 name="file-alt" size={16} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Documents</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: currentColors.primary }]} 
                onPress={() => setModelModalVisible(true)}
              >
                <MaterialIcons name="settings" size={16} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>
                  {currentModel ? `Model: ${currentModel.split('/').pop()}` : 'Select Model'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Mode Toggle Switches */}
            <View style={styles.modeTogglesContainer}>
              <View style={styles.toggleItem}>
                <Text style={[styles.toggleLabel, { color: currentColors.text }]}>Raw Text Mode</Text>
                <Switch
                  value={rawMode}
                  onValueChange={setRawMode}
                  trackColor={{ false: "#767577", true: currentColors.switchBg }}
                  thumbColor={rawMode ? "#f5dd4b" : "#f4f3f4"}
                />
              </View>
              
              <View style={styles.toggleItem}>
                <Text style={[styles.toggleLabel, { color: currentColors.text }]}>Exact Page Mode</Text>
                <Switch
                  value={exactPageMode}
                  onValueChange={setExactPageMode}
                  trackColor={{ false: "#767577", true: currentColors.switchBg }}
                  thumbColor={exactPageMode ? "#f5dd4b" : "#f4f3f4"}
                />
              </View>
            </View>
            
            {/* Input Container */}
            <View style={styles.questionSection}>
              <Text style={[styles.sectionTitle, { color: currentColors.text }]}>
                Ask About Your Documents
              </Text>
              
              <View style={[
                styles.inputContainer,
                { backgroundColor: currentColors.inputBackground },
                isFocused && [styles.inputContainerFocused, { borderColor: currentColors.primary }]
              ]}>
                <TextInput
                  style={[styles.input, { color: currentColors.inputText }]}
                  placeholder="Ask a question about your documents..."
                  placeholderTextColor="#a0a0a0"
                  value={question}
                  onChangeText={setQuestion}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
                
                {question.length > 0 && (
                  <TouchableOpacity 
                    style={styles.clearInputButton}
                    onPress={clearInput}
                  >
                    <MaterialIcons name="close" size={20} color="#888" />
                  </TouchableOpacity>
                )}
              </View>
              
              <TouchableOpacity 
                style={[
                  styles.submitButton,
                  { backgroundColor: currentColors.sendButtonBg },
                  (!question.trim() || loading) && styles.disabledButton
                ]}
                onPress={handleSubmit}
                disabled={!question.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.submitButtonContent}>
                    <Text style={styles.submitButtonText}>
                      Get Answer
                    </Text>
                    <MaterialIcons name="send" size={20} color="#FFFFFF" style={styles.sendIcon} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
            
            {/* Answer Container */}
           {/* Answer Container */}
<View style={styles.answerSection}>
  <Text style={[styles.sectionTitle, { color: currentColors.text }]}>
    Answer
  </Text>
  
  <View style={[
    styles.answerContainer,
    { backgroundColor: currentColors.answerBackground }
  ]}>
    {answer ? (
      <ScrollView 
        style={styles.answerScrollView}
        contentContainerStyle={styles.answerScrollContent}
        showsVerticalScrollIndicator={true}
        persistentScrollbar={true}
        nestedScrollEnabled={true} // This is crucial for nested scrolling
        scrollEnabled={true}
        bounces={true}
      >
        <Text style={[styles.answerText, { color: currentColors.answerText }]}>
          {answer}
        </Text>
        
        {(source || page !== null) && (
          <View style={styles.sourceInfoContainer}>
            {source && (
              <Text style={[styles.sourceText, { color: currentColors.primary }]}>
                Source: {source}
              </Text>
            )}
            {page !== null && (
              <Text style={[styles.pageText, { color: currentColors.primary }]}>
                Page: {page}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    ) : (
      <View style={styles.emptyAnswer}>
        <Text style={[styles.emptyAnswerText, { color: currentColors.subtitleText }]}>
          Ask a question about your documents and I'll find the information you need!
        </Text>
      </View>
    )}
  </View>
  
  {answer && (
    <View style={styles.scrollHintContainer}>
      <MaterialIcons name="swap-vert" size={16} color={currentColors.subtitleText} />
      <Text style={[styles.scrollHintText, { color: currentColors.subtitleText }]}>
        Scroll to see more
      </Text>
    </View>
  )}
</View>
            
            {/* Footer Banner */}
            <View style={[
              styles.footerBanner, 
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }
            ]}>
              <Text style={[styles.footerText, { color: currentColors.subtitleText }]}>
                Documind - Powered by Ollama LLM Models
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
      
      {/* Modals */}
      {renderDocumentModal()}
      {renderModelModal()}
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  themeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeSwitch: {
    marginLeft: 8,
  },
  mainContent: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  serverStatusContainer: {
    marginBottom: 15,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  blurViewContent: {
    padding: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
  },
  retryButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flex: 0.48,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  modeTogglesContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
  },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  questionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputContainer: {
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputContainerFocused: {
    borderWidth: 2,
  },
  input: {
    fontSize: 16,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  clearInputButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
  },
  submitButton: {
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  sendIcon: {
    marginTop: 2,
  },
  answerSection: {
    marginBottom: 15,
  },
  answerContainer: {
    borderRadius: 12,
    minHeight: 150, 
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  answerScrollView: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  answerScrollContent: {
    flexGrow: 1, // This ensures content can grow within the scroll view
    paddingBottom: 10,
  },
  answerText: {
    fontSize: 16,
    lineHeight: 24,
  },
  sourceInfoContainer: {
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  sourceText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 5,
  },
  pageText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyAnswer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  emptyAnswerText: {
    textAlign: 'center',
    fontSize: 14,
  },
  scrollHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  scrollHintText: {
    fontSize: 12,
    marginLeft: 4,
  },
  footerBanner: {
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  footerText: {
    fontSize: 12,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    width: width * 0.85,
    maxHeight: height * 0.7,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 15,
    textAlign: 'center',
  },
  noDocumentsText: {
    padding: 20,
    textAlign: 'center',
    fontSize: 16,
  },
  documentList: {
    maxHeight: height * 0.4,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  documentName: {
    fontSize: 16,
    marginLeft: 10,
    flex: 1,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    flex: 0.48,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modelList: {
    maxHeight: height * 0.4,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modelName: {
    fontSize: 16,
    marginLeft: 10,
    flex: 1,
  }
});

export default DOCUMIND_APP;