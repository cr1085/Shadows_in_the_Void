document.addEventListener('DOMContentLoaded', () => {
  // Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = {
        username: loginForm.username.value,
        password: loginForm.password.value
      };
      
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          localStorage.setItem('currentUser', data.user.username);
          window.location.href = '/welcome';
        } else {
          showMessage(data.error || 'Error en el login', 'error');
        }
      } catch (err) {
        showMessage('Error de conexión', 'error');
      }
    });
  }
  
  // Register Form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = {
        username: registerForm.username.value,
        email: registerForm.email.value,
        password: registerForm.password.value
      };
      
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          showMessage('Registro exitoso. Redirigiendo...', 'success');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 1500);
        } else {
          showMessage(data.error || 'Error en el registro', 'error');
        }
      } catch (err) {
        showMessage('Error de conexión', 'error');
      }
    });
  }
});

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  if (!messageDiv) return;
  
  messageDiv.textContent = text;
  messageDiv.className = 'message ' + type;
  messageDiv.style.display = 'block';
  
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}