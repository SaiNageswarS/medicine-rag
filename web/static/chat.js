// Chat functionality for Medicine RAG Application
let sessionId = document.getElementById('session-id').textContent;
let messageCount = 0;
let isLoading = false;

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function startNewSession() {
    sessionId = generateSessionId();
    messageCount = 0;
    
    document.getElementById('session-id').textContent = sessionId;
    document.getElementById('message-count').textContent = messageCount;
    
    // Clear messages and show welcome
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = document.getElementById('welcome-message').outerHTML;
    
    // Clear input
    document.getElementById('message-input').value = '';
    handleInputChange();
}

function handleInputChange() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    sendButton.disabled = !messageInput.value.trim() || isLoading;
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput.value.trim() || isLoading) return;

    const messageText = messageInput.value.trim();
    messageInput.value = '';
    handleInputChange();

    // Hide welcome message
    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'none';
    }

    // Add user message
    addUserMessage(messageText);

    // Add assistant message placeholder
    const assistantMessageId = addAssistantMessage('', true);

    messageCount++;
    document.getElementById('message-count').textContent = messageCount;
    isLoading = true;

    try {
        await callAgentStreaming(messageText, assistantMessageId);
    } catch (error) {
        console.error('Streaming failed:', error);
        updateAssistantMessage(assistantMessageId, 'Error: ' + error.message, false, true);
    } finally {
        isLoading = false;
        handleInputChange();
    }
}

function addUserMessage(content) {
    const messagesContainer = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-end';
    messageDiv.innerHTML = 
        '<div class="w-full flex justify-end">' +
            '<div class="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-[80%]">' +
                '<div class="flex items-center gap-2 text-xs opacity-80 mb-1">' +
                    '<span>You</span>' +
                    '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Claude</span>' +
                '</div>' +
                '<div class="leading-relaxed break-words">' + escapeHtml(content) + '</div>' +
            '</div>' +
        '</div>';

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function addAssistantMessage(content, isStreaming) {
    const messagesContainer = document.getElementById('messages-container');
    const messageId = Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-start';
    messageDiv.id = 'message-' + messageId;
    
    const contentHtml = content ? renderMarkdown(content) : 
        '<div class="flex items-center gap-2 text-gray-500">' +
            '<div class="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>' +
            '<span class="text-sm">Generating response...</span>' +
        '</div>';

    messageDiv.innerHTML = 
        '<div class="w-full space-y-3">' +
            '<div class="bg-white rounded-lg px-3 sm:px-4 py-3 border w-full border-gray-200">' +
                '<div class="prose prose-sm max-w-none" id="content-' + messageId + '">' +
                    contentHtml +
                '</div>' +
                '<div class="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">' +
                    '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Claude</span>' +
                    '<span class="text-xs text-gray-400">' + new Date().toLocaleTimeString() + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageId;
}

function updateAssistantMessage(messageId, content, isStreaming, hasError) {
    const contentElement = document.getElementById('content-' + messageId);
    if (contentElement && content) {
        contentElement.innerHTML = '<div class="prose prose-sm max-w-none">' + renderMarkdown(content) + '</div>';
    }

    if (hasError) {
        const messageElement = document.getElementById('message-' + messageId);
        if (messageElement) {
            const messageBox = messageElement.querySelector('.bg-white');
            if (messageBox) {
                messageBox.className = messageBox.className.replace('border-gray-200', 'border-red-200 bg-red-50');
            }
        }
    }

    scrollToBottom();
}

async function callAgentStreaming(text, messageId) {
    try {
        const response = await fetch('/api/agent/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                sessionId: sessionId,
                model: 'claude'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullAnswer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data.trim() === '') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.type === 'chunk' && parsed.chunk) {
                            const chunk = parsed.chunk;
                            
                            // Handle different chunk types
                            if (chunk.answer && chunk.answer.content) {
                                fullAnswer += chunk.answer.content;
                                updateAssistantMessage(messageId, fullAnswer, true, false);
                            }
                            
                            if (chunk.complete) {
                                updateAssistantMessage(messageId, fullAnswer, false, false);
                            }
                            
                            if (chunk.error) {
                                throw new Error(chunk.error.errorMessage || 'Unknown error');
                            }
                        }
                        
                        if (parsed.type === 'error') {
                            throw new Error(parsed.message);
                        }
                        
                    } catch (parseError) {
                        console.warn('Failed to parse SSE data:', data, parseError);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Streaming error:', error);
        throw error;
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    // Simple markdown rendering
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.)/gm, '<p>$1')
        .replace(/(.)$/gm, '$1</p>')
        .replace(/<p><\/p>/g, '')
        .replace(/<p>(<h[1-6]>)/g, '$1')
        .replace(/(<\/h[1-6]>)<\/p>/g, '$1');
}
