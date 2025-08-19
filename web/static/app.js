// Basic JavaScript functionality for the web application

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Medicine RAG Web Application initialized');
    
    // Initialize login page if present
    if (document.querySelector('.login-form')) {
        initLoginPage();
    }
    
    // Initialize chat page if present
    if (document.querySelector('.chat-container')) {
        initChatPage();
    }
});

function initLoginPage() {
    const loginForm = document.querySelector('.login-form form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<div class="loading"></div> Signing in...';
            }
        });
    }
}

function initChatPage() {
    console.log('Chat page initialized');
    // Chat functionality is handled by chat.js
}

// Utility functions
function showError(message) {
    console.error('Error:', message);
    // You could implement a toast notification system here
}

function showSuccess(message) {
    console.log('Success:', message);
    // You could implement a toast notification system here
}
