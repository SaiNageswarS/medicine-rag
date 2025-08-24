// Chat functionality for Medicine RAG Application

// Get user data from Go template
const userData = {
    user: document.querySelector('meta[name="user"]').content,
    sessionId: document.querySelector('meta[name="session-id"]').content
};

let messageCount = 0;
let isLoading = false;

// Configure marked for medical content with proper newline handling
marked.setOptions({
    breaks: true,       // Convert '\n' in paragraphs into <br>
    gfm: true,          // Enable GitHub Flavored Markdown
    pedantic: false,    // Don't conform to original markdown spec (allows more flexibility)
    sanitize: false,    // Don't sanitize HTML (we control the input)
    smartLists: true,   // Use smarter list behavior
    smartypants: false, // Don't use smart quotes/dashes
    mangle: false,      // Don't mangle email addresses
    headerIds: false,   // Don't add header IDs
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    }
});

// Enhanced markdown renderer using marked.js library
function renderMarkdown(text) {
    if (!text) return '';
    
    // Use marked.js library for proper markdown parsing
    // marked.js with breaks: true will handle line breaks properly
    const html = marked.parse(text);
    
    // Create a temporary div to process code highlighting
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Apply syntax highlighting to code blocks
    tempDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
    
    return tempDiv.innerHTML;
}

function startNewSession() {
    messageCount = 0;
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
    messageDiv.className = 'flex justify-end mb-4';
    messageDiv.innerHTML = 
        '<div class="w-full flex justify-end">' +
            '<div class="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-[80%]">' +
                '<div class="flex items-center gap-2 text-xs opacity-80 mb-1">' +
                    '<span>' + userData.user + '</span>' +
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
    messageDiv.className = 'flex justify-start mb-4';
    messageDiv.id = 'message-' + messageId;
    
    const contentHtml = content ? renderMarkdown(content) : 
        '<div class="flex items-center gap-2 text-gray-500">' +
            '<div class="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>' +
            '<span class="text-sm">Generating response...</span>' +
        '</div>';

    messageDiv.innerHTML = 
        '<div class="w-full space-y-3">' +
            '<div class="bg-white rounded-lg px-3 sm:px-4 py-3 border w-full border-gray-200">' +
                '<div id="progress-' + messageId + '" class="mb-3 hidden"></div>' +
                '<div id="tools-' + messageId + '" class="mb-3 space-y-2 hidden"></div>' +
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

function updateProgress(messageId, progress) {
    const progressEl = document.getElementById('progress-' + messageId);
    if (progressEl && progress) {
        progressEl.innerHTML = 
            '<div class="flex items-center gap-2 text-sm text-blue-600">' +
                '<div class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>' +
                '<span>' + progress + '</span>' +
            '</div>';
        progressEl.classList.remove('hidden');
    } else if (progressEl) {
        progressEl.classList.add('hidden');
    }
}

function addToolResult(messageId, toolResult) {
    const toolsEl = document.getElementById('tools-' + messageId);
    if (!toolsEl || !toolResult) return;

    const toolId = 'tool-' + messageId + '-' + Date.now();
    const toolDiv = document.createElement('div');
    toolDiv.className = 'border border-blue-200 rounded-lg overflow-hidden';
    
    // Create collapsible content - format sentences as bullet points
    const sentences = toolResult.sentences || [];
    const fullContent = sentences.join('\n'); 
    const preview = sentences.slice(0, 2).join(' ') + (sentences.length > 2 ? '...' : '');
    
    toolDiv.innerHTML = 
        '<div class="bg-blue-50 border-l-4 border-blue-400">' +
            '<button type="button" class="w-full p-3 text-left hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset" onclick="event.preventDefault(); toggleToolResult(\'' + toolId + '\', event)">' +
                '<div class="flex items-center justify-between">' +
                    '<div class="font-semibold text-blue-800 text-sm flex items-center gap-2">' +
                        '<span>🔍</span>' +
                        '<span>' + escapeHtml(toolResult.title || 'Search Result') + '</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-2">' +
                        (toolResult.attribution ? '<span class="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">' + escapeHtml(toolResult.attribution) + '</span>' : '') +
                        '<svg id="' + toolId + '-icon" class="w-4 h-4 text-blue-600 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>' +
                        '</svg>' +
                    '</div>' +
                '</div>' +
                '<div class="text-blue-700 text-sm mt-1" id="' + toolId + '-preview">' + renderMarkdown(preview) + '</div>' +
            '</button>' +
            '<div id="' + toolId + '-content" class="hidden border-t border-blue-200 p-3 bg-white transition-all duration-300">' +
                '<div class="prose prose-sm max-w-none">' + renderMarkdown(fullContent) + '</div>' +
                (toolResult.metadata ? 
                    '<div class="mt-3 pt-3 border-t text-xs text-gray-600">' +
                        '<div class="grid grid-cols-2 gap-2">' +
                            Object.entries(toolResult.metadata).map(([key, value]) => 
                                '<div><span class="font-medium">' + escapeHtml(key) + ':</span> ' + escapeHtml(String(value)) + '</div>'
                            ).join('') +
                        '</div>' +
                    '</div>' : '') +
            '</div>' +
        '</div>';
    
    toolsEl.appendChild(toolDiv);
    toolsEl.classList.remove('hidden');
    // Don't auto-scroll when adding tool results to avoid interrupting user reading
}

function toggleToolResult(toolId, event) {
    // Prevent any default button behavior and event bubbling
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const content = document.getElementById(toolId + '-content');
    const icon = document.getElementById(toolId + '-icon');
    const preview = document.getElementById(toolId + '-preview');
    
    if (!content || !icon || !preview) return;
    
    // Store current scroll position
    const messagesContainer = document.getElementById('messages-container');
    const currentScrollTop = messagesContainer.scrollTop;
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
        preview.style.display = 'none';
    } else {
        content.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
        preview.style.display = 'block';
    }
    
    // Restore scroll position to prevent unwanted scrolling
    setTimeout(() => {
        messagesContainer.scrollTop = currentScrollTop;
    }, 0);
}

function updateAssistantMessage(messageId, content, isStreaming, hasError) {
    const contentElement = document.getElementById('content-' + messageId);
    if (contentElement && content) {
        contentElement.innerHTML = renderMarkdown(content);
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

    // Only scroll to bottom if we're not streaming (final message) or if there's an error
    if (!isStreaming || hasError) {
        scrollToBottom();
    }
}

// Enhanced SSE handling with real-time updates
async function callAgentStreaming(text, messageId) {
    let fullAnswer = '';
    
    try {
        console.log('Starting agent streaming request:', text);
        
        const response = await fetch('/api/agent/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                sessionId: userData.sessionId,
                model: 'claude'
            })
        });

        console.log('Fetch response status:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Starting to read response stream...');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                console.log('Stream reading completed');
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (!data || data === '') continue;
                    
                    console.log('Raw SSE data:', data);
                    
                    try {
                        const parsed = JSON.parse(data);
                        console.log('Received chunk:', parsed);
                        
                        if (parsed.type === 'chunk' && parsed.chunk) {
                            const chunk = parsed.chunk;
                            
                            // Handle different chunk types based on the actual structure
                            if (chunk.ChunkType) {
                                const chunkType = chunk.ChunkType;
                                
                                // Handle progress updates
                                if (chunkType.ProgressUpdateChunk) {
                                    const progress = chunkType.ProgressUpdateChunk;
                                    console.log('Progress update:', progress.message);
                                    updateProgress(messageId, progress.message);
                                }
                                
                                // Handle tool results
                                if (chunkType.ToolResultChunk) {
                                    const toolResult = chunkType.ToolResultChunk;
                                    console.log('Tool result received:', toolResult.title);
                                    addToolResult(messageId, toolResult);
                                }
                                
                                // Handle answer content
                                if (chunkType.Answer) {
                                    const answer = chunkType.Answer;
                                    console.log('Answer chunk received');
                                    fullAnswer = answer.content; // Use the full content, not append
                                    updateAssistantMessage(messageId, fullAnswer, true, false);
                                }
                                
                                // Handle completion
                                if (chunkType.Complete) {
                                    const complete = chunkType.Complete;
                                    console.log('Stream completed:', complete.processingTime + 'ms');
                                    updateProgress(messageId, ''); // Clear progress
                                    updateAssistantMessage(messageId, complete.answer || fullAnswer, false, false);
                                    break;
                                }
                            }
                        }
                        
                        if (parsed.type === 'error') {
                            throw new Error(parsed.message);
                        }
                        
                        if (parsed.type === 'end') {
                            console.log('Stream ended normally');
                            updateProgress(messageId, '');
                            break;
                        }
                        
                    } catch (parseError) {
                        console.warn('Failed to parse SSE data:', data, parseError);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Streaming error:', error);
        updateProgress(messageId, '');
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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('Chat initialized with user:', userData.user);
    handleInputChange();
});