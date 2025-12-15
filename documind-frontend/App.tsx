import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';

const { width, height } = Dimensions.get('window');

const DOCUMIND_APP = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [serverStatus, setServerStatus] = useState('unknown');
  const [rawMode, setRawMode] = useState(false);
  const [exactPageMode, setExactPageMode] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [isDocumentModalVisible, setDocumentModalVisible] = useState(false);
  const [isModelModalVisible, setModelModalVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const cardAnimations = useRef(documents.map(() => new Animated.Value(0))).current;

  const SERVER_URLS = ['http://192.168.1.103:5000'];
  const [currentServerUrlIndex] = useState(0);
  const currentServerUrl = SERVER_URLS[currentServerUrlIndex] || SERVER_URLS[0];

  const hasFetchedRef = useRef(false);
  const hasCheckedServerRef = useRef(false);
  const isMountedRef = useRef(true);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    if (!hasCheckedServerRef.current) {
      hasCheckedServerRef.current = true;
      checkServerConnection();
    }

    return () => {
      isMountedRef.current = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (serverStatus === 'connected' && !hasFetchedRef.current && isMountedRef.current) {
      hasFetchedRef.current = true;
      fetchDocuments();
      fetchModels();
    }
  }, [serverStatus]);

  // Pulse animation for loading
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [loading]);

  // Animate document cards when they change
  useEffect(() => {
    documents.forEach((_, index) => {
      Animated.timing(cardAnimations[index] || new Animated.Value(0), {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }).start();
    });
  }, [documents]);

  const checkServerConnection = async () => {
    if (serverStatus === 'checking') return;
    
    try {
      if (!isMountedRef.current) return;
      setServerStatus('checking');
      
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
      
      if (!isMountedRef.current) return;
      
      if (response.ok) {
        const data = await response.json();
        setServerStatus('connected');
        console.log('Server connection successful!', data);
        
        if (data.current_model) {
          setCurrentModel(data.current_model);
        }
      } else {
        setServerStatus('error');
        console.log('Server returned an error status');
        shakeAnimation();
      }
    } catch (exception) {
      console.error('Server connection exception:', exception);
      if (isMountedRef.current) {
        setServerStatus('error');
        shakeAnimation();
      }
      
      if (exception instanceof Error && exception.name === 'AbortError') {
        console.log('Connection timeout');
      }
    }
  };

  const shakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const fetchDocuments = async () => {
    try {
      const timestamp = new Date().getTime();
      const url = `${currentServerUrl}/api/document-list?t=${timestamp}`;
      console.log('Fetching documents from:', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (response.ok && isMountedRef.current) {
        const data = await response.json();
        console.log('Documents received:', data.documents);
        setDocuments(data.documents || []);
        setRefreshKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch(`${currentServerUrl}/api/available-models`);
      if (response.ok && isMountedRef.current) {
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
      
      if (response.ok && isMountedRef.current) {
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
      if (isMountedRef.current) {
        setModelModalVisible(false);
      }
    }
  };

  const uploadDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];

      const doUpload = async () => {
        try {
          const formData = new FormData();

          formData.append('document', {
            uri: file.uri,
            type: file.mimeType || 'application/octet-stream',
            name: file.name,
          } as any);

          if (isMountedRef.current) {
            setLoading(true);
          }

          const uploadResponse = await fetch(
            `${currentServerUrl}/api/ingest/upload-document`,
            {
              method: 'POST',
              body: formData,
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            }
          );

          if (uploadResponse.ok && isMountedRef.current) {
            const uploadData = await uploadResponse.json();
            console.log('Upload successful:', uploadData);
            console.log('Waiting for backend to process...');
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log('First fetch...');
            await fetchDocuments();
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('Second fetch...');
            await fetchDocuments();
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('Third fetch...');
            await fetchDocuments();
            Alert.alert('Success', `Uploaded ${file.name} successfully`);
          } else {
            let errorMessage = 'Upload failed';
            try {
              const errorData = await uploadResponse.json();
              errorMessage = errorData.error || errorMessage;
            } catch {
              errorMessage = await uploadResponse.text();
            }
            Alert.alert('Upload Failed', errorMessage);
          }
        } catch (error) {
          console.error('Document upload error:', error);
          Alert.alert('Error', 'Failed to upload document');
        } finally {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }
      };

      doUpload();
    } catch (error) {
      console.error('Document picker error:', error);
      Alert.alert('Error', 'Failed to select document');
    }
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    // Add smooth transition animation
    Animated.timing(fadeAnim, {
      toValue: 0.7,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleSubmit = async () => {
    if (!question.trim()) {
      Alert.alert('Error', 'Please enter a question');
      return;
    }
    
    if (isMountedRef.current) {
      setLoading(true);
      setAnswer('');
      setSource(null);
      setPage(null);
      setProcessingTime(0);
    }
    
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        setProcessingTime(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);
    
    try {
      console.log(`Sending request to ${currentServerUrl}/api/ask-question`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      
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
      
      if (isMountedRef.current) {
        if (data && data.answer) {
          setAnswer(data.answer);
          setSource(data.source || null);
          setPage(data.page || null);
        } else {
          setAnswer('Sorry, could not get an answer.');
        }
      }
    } catch (exception) {
      console.error('Error submitting question:', exception);
      
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (exception instanceof Error && exception.name === 'AbortError') {
        errorMessage = 'Request timed out after 3 minutes. The question might be too complex or the model is busy. Please try a simpler question or wait a moment and try again.';
      } 
      else if (exception instanceof Error && exception.message) {
        errorMessage = `Request failed: ${exception.message}`;
      }
      
      if (isMountedRef.current) {
        setAnswer(errorMessage);
      }
    } finally {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (isMountedRef.current) {
        setLoading(false);
        setProcessingTime(0);
      }
    }
  };

  const clearInput = () => {
    setQuestion('');
    setAnswer('');
    setSource(null);
    setPage(null);
    // Add clear animation
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleRetryConnection = () => {
    hasCheckedServerRef.current = false;
    hasFetchedRef.current = false;
    checkServerConnection();
  };

  const colors = {
    light: {
      background: 'rgba(245, 247, 250, 0.92)',
      primary: '#2196F3',
      primaryDark: '#1976D2',
      secondary: '#42A5F5',
      accent: '#FF6B6B',
      success: '#4CAF50',
      text: '#1A1A1A',
      subtitleText: '#666666',
      inputBackground: 'rgba(255, 255, 255, 0.98)',
      inputText: '#1A1A1A',
      answerBackground: 'rgba(255, 255, 255, 0.98)',
      answerText: '#1A1A1A',
      clearButtonBg: '#FF6B6B',
      errorText: '#e53935',
      backgroundOverlay: 'rgba(255, 255, 255, 0.7)',
      switchBg: '#bbdefb',
      modalBackground: 'rgba(255, 255, 255, 0.98)',
      modalItemBg: '#F8F9FA',
      modalItemText: '#1A1A1A',
      modalHeaderText: '#FFFFFF',
      statusBg: 'rgba(255, 255, 255, 0.95)',
      cardShadow: 'rgba(0, 0, 0, 0.08)',
      border: 'rgba(0, 0, 0, 0.08)',
      gradientStart: '#667eea',
      gradientEnd: '#764ba2',
      headerGradientStart: '#667eea',
      headerGradientEnd: '#764ba2',
    },
    dark: {
      background: 'rgba(18, 18, 18, 0.88)',
      primary: '#64B5F6',
      primaryDark: '#42A5F5',
      secondary: '#1E88E5',
      accent: '#FF8A80',
      success: '#66BB6A',
      text: '#FFFFFF',
      subtitleText: '#B0B0B0',
      inputBackground: 'rgba(30, 30, 30, 0.98)',
      inputText: '#FFFFFF',
      answerBackground: 'rgba(25, 25, 25, 0.98)',
      answerText: '#FFFFFF',
      clearButtonBg: '#D32F2F',
      errorText: '#ff6e6e',
      backgroundOverlay: 'rgba(0, 0, 0, 0.8)',
      switchBg: '#1565C0',
      modalBackground: 'rgba(30, 30, 30, 0.98)',
      modalItemBg: '#2A2A2A',
      modalItemText: '#FFFFFF',
      modalHeaderText: '#FFFFFF',
      statusBg: 'rgba(25, 25, 25, 0.95)',
      cardShadow: 'rgba(0, 0, 0, 0.3)',
      border: 'rgba(255, 255, 255, 0.1)',
      gradientStart: '#667eea',
      gradientEnd: '#764ba2',
      headerGradientStart: '#434343',
      headerGradientEnd: '#000000',
    }
  };

  const currentColors = isDarkMode ? colors.dark : colors.light;

  const renderServerStatus = () => {
    let statusColor = '#FFA726';
    let statusText = 'Checking server...';
    let statusIcon: keyof typeof MaterialIcons.glyphMap = 'sync';
    
    if (serverStatus === 'connected') {
      statusColor = '#66BB6A';
      statusText = 'Connected';
      statusIcon = 'check-circle';
    } else if (serverStatus === 'error') {
      statusColor = '#EF5350';
      statusText = 'Connection failed';
      statusIcon = 'error';
    } else if (serverStatus === 'unknown') {
      statusColor = '#FFA726';
      statusText = 'Status unknown';
      statusIcon = 'help';
    }
    
    return (
      <Animated.View style={[
        styles.serverStatusContainer, 
        { 
          backgroundColor: currentColors.statusBg,
          transform: [{ translateX: shakeAnim }],
        }
      ]}>
        <View style={styles.statusRow}>
          <MaterialIcons name={statusIcon} size={20} color={statusColor} />
          <Text style={[styles.statusText, { color: currentColors.text, fontWeight: '600' }]}>
            {statusText}
          </Text>
        </View>
        
        {serverStatus === 'error' && (
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: currentColors.primary }]} 
            onPress={handleRetryConnection}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  const renderDocumentModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDocumentModalVisible}
        onRequestClose={() => setDocumentModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <Animated.View style={[
            styles.modalView, 
            { 
              backgroundColor: currentColors.modalBackground,
              transform: [{ scale: fadeAnim }],
            }
          ]}>
            <LinearGradient
              colors={[currentColors.gradientStart, currentColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalTitleContainer}
            >
              <MaterialIcons name="folder-open" size={24} color="#FFFFFF" />
              <Text style={[styles.modalTitle, { color: currentColors.modalHeaderText }]}>
                Documents
              </Text>
              <TouchableOpacity 
                style={styles.refreshButton}
                onPress={() => fetchDocuments()}
                disabled={loading}
                activeOpacity={0.7}
              >
                <MaterialIcons name="refresh" size={24} color={currentColors.modalHeaderText} />
              </TouchableOpacity>
            </LinearGradient>
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={currentColors.primary} />
                <Text style={[styles.loadingText, { color: currentColors.subtitleText }]}>
                  Processing...
                </Text>
              </View>
            ) : documents.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <MaterialIcons name="description" size={64} color={currentColors.subtitleText} opacity={0.3} />
                <Text style={[styles.noDocumentsText, { color: currentColors.subtitleText }]}>
                  No documents yet
                </Text>
                <Text style={[styles.noDocumentsSubtext, { color: currentColors.subtitleText }]}>
                  Upload your first document to get started
                </Text>
              </View>
            ) : (
              <Animated.FlatList
                data={documents}
                extraData={refreshKey}
                keyExtractor={(item, index) => `doc-${refreshKey}-${index}-${item}`}
                renderItem={({ item, index }) => (
                  <Animated.View
                    style={{
                      opacity: fadeAnim,
                      transform: [{
                        translateY: fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      }],
                    }}
                  >
                    <TouchableOpacity 
                      style={[styles.documentItem, { 
                        backgroundColor: currentColors.modalItemBg,
                        borderLeftWidth: 3,
                        borderLeftColor: currentColors.primary,
                      }]}
                      onPress={() => {
                        setQuestion(prevQuestion => {
                          const prevLower = (prevQuestion || "").toLowerCase();
                          const itemLower = (item || "").toLowerCase();
                          
                          if (!prevLower.includes(itemLower)) {
                            return (prevQuestion || "") + (prevQuestion ? ' ' : '') + (item || "");
                          }
                          return prevQuestion || "";
                        });
                        setDocumentModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.documentIconContainer}>
                        <FontAwesome5 name="file-pdf" size={20} color={currentColors.accent} />
                      </View>
                      <Text 
                        style={[styles.documentName, { color: currentColors.modalItemText }]}
                        numberOfLines={2}
                      >
                        {item || "Untitled Document"}
                      </Text>
                      <MaterialIcons name="chevron-right" size={20} color={currentColors.subtitleText} />
                    </TouchableOpacity>
                  </Animated.View>
                )}
                style={styles.documentList}
                showsVerticalScrollIndicator={false}
              />
            )}
            
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentColors.clearButtonBg }]}
                onPress={() => setDocumentModalVisible(false)}
                disabled={loading}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={18} color="#FFFFFF" />
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  { backgroundColor: currentColors.primary },
                  loading && styles.disabledButton
                ]}
                onPress={uploadDocument}
                disabled={loading}
                activeOpacity={0.7}
              >
                <MaterialIcons name="cloud-upload" size={18} color="#FFFFFF" />
                <Text style={styles.modalButtonText}>
                  {loading ? 'Uploading...' : 'Upload'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  const renderModelModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModelModalVisible}
        onRequestClose={() => setModelModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <Animated.View style={[
            styles.modalView, 
            { 
              backgroundColor: currentColors.modalBackground,
              transform: [{ scale: fadeAnim }],
            }
          ]}>
            <LinearGradient
              colors={[currentColors.gradientStart, currentColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalTitleContainer}
            >
              <MaterialIcons name="psychology" size={24} color="#FFFFFF" />
              <Text style={[styles.modalTitle, { color: currentColors.modalHeaderText }]}>
                AI Models
              </Text>
              <View style={{ width: 24 }} />
            </LinearGradient>
            
            {availableModels.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <MaterialIcons name="model-training" size={64} color={currentColors.subtitleText} opacity={0.3} />
                <Text style={[styles.noDocumentsText, { color: currentColors.subtitleText }]}>
                  No models available
                </Text>
              </View>
            ) : (
              <Animated.FlatList
                data={availableModels}
                keyExtractor={(item, index) => `model-${index}-${item}`}
                renderItem={({ item, index }) => (
                  <Animated.View
                    style={{
                      opacity: fadeAnim,
                      transform: [{
                        scale: fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        }),
                      }],
                    }}
                  >
                    <TouchableOpacity 
                      style={[
                        styles.modelItem, 
                        { 
                          backgroundColor: item === currentModel 
                            ? currentColors.primary 
                            : currentColors.modalItemBg,
                          borderLeftWidth: item === currentModel ? 4 : 0,
                          borderLeftColor: currentColors.accent,
                        }
                      ]}
                      onPress={() => selectModel(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modelIconContainer}>
                        <Ionicons 
                          name={item === currentModel ? "checkmark-circle" : "radio-button-off"} 
                          size={24} 
                          color={item === currentModel ? "#FFFFFF" : currentColors.primary} 
                        />
                      </View>
                      <Text 
                        style={[
                          styles.modelName, 
                          { 
                            color: item === currentModel 
                              ? "#FFFFFF" 
                              : currentColors.modalItemText,
                            fontWeight: item === currentModel ? '700' : '500'
                          }
                        ]}
                        numberOfLines={2}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                style={styles.modelList}
                showsVerticalScrollIndicator={false}
              />
            )}
            
            <TouchableOpacity
              style={[styles.modalCloseButton, { backgroundColor: currentColors.clearButtonBg }]}
              onPress={() => setModelModalVisible(false)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={18} color="#FFFFFF" />
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
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
      <Animated.View style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }
      ]}>
        <StatusBar 
          barStyle={isDarkMode ? "light-content" : "dark-content"} 
          backgroundColor="transparent"
          translucent
        />
        
        <LinearGradient
          colors={[currentColors.headerGradientStart, currentColors.headerGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              <View style={styles.logoIconContainer}>
                <MaterialIcons name="description" size={28} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.title}>Documind</Text>
                <Text style={styles.subtitle}>AI-Powered Document Assistant</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.themeToggleContainer}
              onPress={toggleTheme}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name={isDarkMode ? "nightlight-round" : "wb-sunny"} 
                size={24} 
                color="#FFFFFF" 
              />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.mainContent}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderServerStatus()}
            
            <View style={styles.quickActionsCard}>
              <Text style={[styles.cardTitle, { color: currentColors.text }]}>Quick Actions</Text>
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity 
                  style={[styles.actionButton, { backgroundColor: currentColors.primary }]} 
                  onPress={() => setDocumentModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionButtonIcon}>
                    <FontAwesome5 name="file-alt" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.actionButtonText}>Documents</Text>
                  <Text style={styles.actionButtonSubtext}>{documents.length} files</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.actionButton, { backgroundColor: currentColors.secondary }]} 
                  onPress={() => setModelModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionButtonIcon}>
                    <MaterialIcons name="psychology" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.actionButtonText}>AI Model</Text>
                  <Text style={styles.actionButtonSubtext} numberOfLines={1}>
                    {currentModel ? currentModel.split('/').pop()?.substring(0, 15) : 'Select'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={[styles.modeTogglesCard, { backgroundColor: currentColors.inputBackground }]}>
              <Text style={[styles.cardTitle, { color: currentColors.text }]}>Settings</Text>
              
              <View style={styles.toggleItem}>
                <View style={styles.toggleLeft}>
                  <MaterialIcons name="text-fields" size={20} color={currentColors.primary} />
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.toggleLabel, { color: currentColors.text }]}>Raw Text Mode</Text>
                    <Text style={[styles.toggleDescription, { color: currentColors.subtitleText }]}>
                      Extract plain text
                    </Text>
                  </View>
                </View>
                <Switch
                  value={rawMode}
                  onValueChange={setRawMode}
                  trackColor={{ false: "#767577", true: currentColors.primary }}
                  thumbColor={rawMode ? "#FFFFFF" : "#f4f3f4"}
                />
              </View>
              
              <View style={[styles.toggleItem, { marginTop: 12 }]}>
                <View style={styles.toggleLeft}>
                  <MaterialIcons name="filter-center-focus" size={20} color={currentColors.primary} />
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.toggleLabel, { color: currentColors.text }]}>Exact Page Mode</Text>
                    <Text style={[styles.toggleDescription, { color: currentColors.subtitleText }]}>
                      Precise location
                    </Text>
                  </View>
                </View>
                <Switch
                  value={exactPageMode}
                  onValueChange={setExactPageMode}
                  trackColor={{ false: "#767577", true: currentColors.primary }}
                  thumbColor={exactPageMode ? "#FFFFFF" : "#f4f3f4"}
                />
              </View>
            </View>
            
            <View style={[styles.questionCard, { backgroundColor: currentColors.inputBackground }]}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="question-answer" size={22} color={currentColors.primary} />
                <Text style={[styles.cardTitle, { color: currentColors.text, marginLeft: 8 }]}>
                  Ask Your Question
                </Text>
              </View>
              
              <View style={[
                styles.inputContainer,
                isFocused && [styles.inputContainerFocused, { borderColor: currentColors.primary }]
              ]}>
                <TextInput
                  style={[styles.input, { color: currentColors.inputText }]}
                  placeholder="What would you like to know about your documents?"
                  placeholderTextColor={currentColors.subtitleText}
                  value={question}
                  onChangeText={setQuestion}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
                
                {question.length > 0 && (
                  <View style={styles.inputFooter}>
                    <Text style={[styles.charCount, { color: currentColors.subtitleText }]}>
                      {question.length}/500
                    </Text>
                    <TouchableOpacity 
                      style={styles.clearInputButton}
                      onPress={clearInput}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="close" size={18} color={currentColors.subtitleText} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <LinearGradient
                  colors={[currentColors.gradientStart, currentColors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.submitButton,
                    (!question.trim() || loading) && styles.disabledButton
                  ]}
                >
                  <TouchableOpacity 
                    style={styles.submitButtonInner}
                    onPress={handleSubmit}
                    disabled={!question.trim() || loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <View style={styles.submitButtonContent}>
                        <ActivityIndicator color="#FFFFFF" size="small" />
                        <Text style={[styles.submitButtonText, { marginLeft: 12 }]}>
                          Processing {processingTime}s
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.submitButtonContent}>
                        <MaterialIcons name="auto-awesome" size={22} color="#FFFFFF" />
                        <Text style={[styles.submitButtonText, { marginLeft: 8 }]}>
                          Get Answer
                        </Text>
                        <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
                      </View>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            </View>
            
            <View style={[styles.answerCard, { backgroundColor: currentColors.answerBackground }]}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="lightbulb" size={22} color={currentColors.accent} />
                <Text style={[styles.cardTitle, { color: currentColors.text, marginLeft: 8 }]}>
                  Answer
                </Text>
              </View>
              
              <View style={styles.answerContainer}>
                {answer ? (
                  <ScrollView 
                    style={styles.answerScrollView}
                    contentContainerStyle={styles.answerScrollContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    <Text style={[styles.answerText, { color: currentColors.answerText }]}>
                      {answer}
                    </Text>
                    
                    {(source || page !== null) && (
                      <View style={[styles.sourceInfoContainer, { borderTopColor: currentColors.border }]}>
                        {source && (
                          <View style={styles.sourceItem}>
                            <MaterialIcons name="source" size={16} color={currentColors.primary} />
                            <Text style={[styles.sourceText, { color: currentColors.primary }]}>
                              {source}
                            </Text>
                          </View>
                        )}
                        {page !== null && (
                          <View style={styles.sourceItem}>
                            <MaterialIcons name="book" size={16} color={currentColors.primary} />
                            <Text style={[styles.pageText, { color: currentColors.primary }]}>
                              Page {page}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </ScrollView>
                ) : (
                  <View style={styles.emptyAnswer}>
                    <View style={[styles.emptyAnswerIconContainer, { backgroundColor: currentColors.modalItemBg }]}>
                      <MaterialIcons name="chat-bubble-outline" size={48} color={currentColors.primary} />
                    </View>
                    <Text style={[styles.emptyAnswerTitle, { color: currentColors.text }]}>
                      Ready to Help!
                    </Text>
                    <Text style={[styles.emptyAnswerText, { color: currentColors.subtitleText }]}>
                      Ask me anything about your documents and I'll provide detailed answers with source references.
                    </Text>
                  </View>
                )}
              </View>
              
              {answer && (
                <View style={styles.scrollHintContainer}>
                  <MaterialIcons name="unfold-more" size={16} color={currentColors.subtitleText} />
                  <Text style={[styles.scrollHintText, { color: currentColors.subtitleText }]}>
                    Scroll for more
                  </Text>
                </View>
              )}
            </View>
            
            <View style={[styles.footerBanner, { backgroundColor: currentColors.modalItemBg }]}>
              <MaterialIcons name="bolt" size={16} color={currentColors.primary} />
              <Text style={[styles.footerText, { color: currentColors.subtitleText }]}>
                Powered by Ollama AI
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
      
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
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight ? StatusBar.currentHeight + 20 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 2,
  },
  themeToggleContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  serverStatusContainer: {
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    marginLeft: 10,
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  quickActionsCard: {
    backgroundColor: 'transparent',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  actionButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    marginTop: 2,
  },
  modeTogglesCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  questionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputContainer: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  inputContainerFocused: {
    backgroundColor: 'transparent',
  },
  input: {
    fontSize: 15,
    minHeight: 100,
    maxHeight: 140,
    textAlignVertical: 'top',
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  charCount: {
    fontSize: 12,
  },
  clearInputButton: {
    padding: 4,
  },
  submitButton: {
    height: 52,
    borderRadius: 26,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    overflow: 'hidden',
  },
  submitButtonInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  answerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  answerContainer: {
    minHeight: 180,
    maxHeight: 320,
  },
  answerScrollView: {
    flex: 1,
  },
  answerScrollContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  answerText: {
    fontSize: 15,
    lineHeight: 24,
  },
  sourceInfoContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  pageText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyAnswer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyAnswerIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyAnswerTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyAnswerText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  scrollHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  scrollHintText: {
    fontSize: 12,
    marginLeft: 6,
  },
  footerBanner: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalView: {
    width: width * 0.9,
    maxHeight: height * 0.75,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  modalTitleContainer: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  refreshButton: {
    padding: 4,
  },
  emptyStateContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDocumentsText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  noDocumentsSubtext: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  documentList: {
    maxHeight: height * 0.45,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  documentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  documentName: {
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  modalCloseButton: {
    margin: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  modelList: {
    maxHeight: height * 0.45,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modelIconContainer: {
    marginRight: 12,
  },
  modelName: {
    fontSize: 14,
    flex: 1,
  },
});

export default DOCUMIND_APP;