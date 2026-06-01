// =============================================================
// CẤU HÌNH 
// =============================================================
const API_BASE_URL      = 'https://euvqiaztlh.execute-api.ap-southeast-1.amazonaws.com/prod/tasks';
const COGNITO_DOMAIN    = 'https://ap-southeast-1jheldqzud.auth.ap-southeast-1.amazoncognito.com';
const COGNITO_CLIENT_ID = '68ea2boblh9dj09tnoqs8d964m'; 
const REDIRECT_URI      = 'https://d2amv6kar9xv3a.cloudfront.net/';

// =============================================================
// QUẢN LÝ THEME SÁNG / TỐI
// =============================================================
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon      = document.getElementById('theme-icon');
const htmlElement    = document.documentElement;

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
        htmlElement.classList.add('dark');
        themeIcon.textContent = '☀️';
    } else {
        htmlElement.classList.remove('dark');
        themeIcon.textContent = '🌙';
    }
}

themeToggleBtn.addEventListener('click', () => {
    htmlElement.classList.toggle('dark');
    const isDark = htmlElement.classList.contains('dark');
    themeIcon.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

initTheme();

// =============================================================
// PKCE HELPER FUNCTIONS
// =============================================================
function generateCodeVerifier() {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function redirectToLogin() {
    const verifier  = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem("pkce_verifier", verifier);

    const loginUrl = `${COGNITO_DOMAIN}/oauth2/authorize`
        + `?response_type=code`
        + `&client_id=${COGNITO_CLIENT_ID}`
        + `&redirect_uri=${REDIRECT_URI}`
        + `&scope=openid+email+profile`
        + `&code_challenge=${challenge}`
        + `&code_challenge_method=S256`;

    window.location.href = loginUrl;
}

async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) throw new Error('Không tìm thấy PKCE verifier');

    const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type:    'authorization_code',
            client_id:     COGNITO_CLIENT_ID,
            redirect_uri:  REDIRECT_URI,
            code:          code,
            code_verifier: verifier
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error_description || 'Lỗi đổi token');
    }

    const data = await response.json();
    sessionStorage.removeItem('pkce_verifier'); 
    return data.id_token;
}

// =============================================================
// QUẢN LÝ DOM
// =============================================================
const authSection    = document.getElementById('auth-section');
const appSection     = document.getElementById('app-section');
const taskForm       = document.getElementById('task-form');
const taskList       = document.getElementById('task-list');
const logoutBtn      = document.getElementById('logout-btn');
const applyFilterBtn = document.getElementById('apply-filter-btn');

let isSessionExpired = false;

function showLoading(message = 'Đang xử lý...') {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    const textEl = document.getElementById('loading-text');
    if(textEl) textEl.textContent = message;
}

function showAppSection() {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
}

// =============================================================
// KHỞI TẠO — Xử lý các trường hợp khi load trang
// =============================================================
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const code      = urlParams.get('code');
    const error     = urlParams.get('error');

    // 1. Nếu User bấm Cancel khi login
    if (error) {
        window.history.replaceState(null, '', window.location.pathname);
        showLoading('Đăng nhập bị hủy. Đang thử lại...');
        setTimeout(redirectToLogin, 1500); 
        return;
    }

    // 2. Nếu vừa được Cognito trả về kèm Code
    if (code) {
        showLoading('Đang xác thực bảo mật...');
        window.history.replaceState(null, '', window.location.pathname);
        try {
            const idToken = await exchangeCodeForToken(code);
            localStorage.setItem('jwtToken', idToken);
            isSessionExpired = false;
            showAppSection();
            fetchTasks();
        } catch (err) {
            console.error('Lỗi exchange token:', err);
            redirectToLogin(); 
        }
        return;
    }

    // 3. Nếu đã đăng nhập từ trước
    if (localStorage.getItem('jwtToken')) {
        showAppSection();
        fetchTasks();
        return;
    }

    // 4. Nếu chưa đăng nhập -> Tự động chuyển qua Cognito
    showLoading('Đang chuyển hướng đến trang Đăng Nhập...');
    redirectToLogin();
}

init();

// =============================================================
// ĐĂNG XUẤT
// =============================================================
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('jwtToken');
    sessionStorage.removeItem('pkce_verifier');
    isSessionExpired = false;
    const params = new URLSearchParams({
        client_id:  COGNITO_CLIENT_ID,
        logout_uri: REDIRECT_URI
    });
    showLoading('Đang đăng xuất...');
    window.location.href = `${COGNITO_DOMAIN}/logout?${params.toString()}`;
});

// =============================================================
// HELPER: Gọi API kèm JWT (REST API Raw Token)
// =============================================================
async function fetchWithAuth(url, options = {}) {
    if (isSessionExpired) throw new Error('Session expired');

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        redirectToLogin();
        throw new Error('No token');
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token, // KHÔNG dùng Bearer cho REST API
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        if (!isSessionExpired) {
            isSessionExpired = true;
            localStorage.removeItem('jwtToken');
            alert('Phiên làm việc hết hạn! Sẽ tự động đăng nhập lại.');
            redirectToLogin();
        }
        throw new Error('Unauthorized');
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
}

// =============================================================
// 1. LẤY DANH SÁCH CÔNG VIỆC — GET /tasks
// =============================================================
applyFilterBtn.addEventListener('click', fetchTasks);

async function fetchTasks() {
    if (isSessionExpired) return;

    const priority = document.getElementById('filter-priority').value;
    const dueDate  = document.getElementById('filter-date').value;

    taskList.innerHTML = '<p class="text-gray-400 italic">Đang tải...</p>';

    try {
        const queryParams = new URLSearchParams();
        if (priority !== 'all') queryParams.append('priority', priority);
        if (dueDate)            queryParams.append('dueDate', dueDate);

        const queryString = queryParams.toString();
        const url = queryString ? `${API_BASE_URL}?${queryString}` : API_BASE_URL;

        const tasks = await fetchWithAuth(url);

        renderTasks(Array.isArray(tasks) ? tasks : []);
        
    } catch (error) {
        if (!['Unauthorized', 'No token', 'Session expired'].includes(error.message)) {
            taskList.innerHTML = '<p class="text-red-500 italic">Lỗi tải dữ liệu. Vui lòng thử lại.</p>';
            console.error('Lỗi fetchTasks:', error);
        }
    }
}

// =============================================================
// 2. TẠO CÔNG VIỆC MỚI — POST /tasks
// =============================================================
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = taskForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang lưu...';

    const newTask = {
        title:       document.getElementById('task-title').value,
        description: document.getElementById('task-desc').value,
        priority:    document.getElementById('task-priority').value,
        dueDate:     document.getElementById('task-due-date').value,
        status:      'pending'
    };

    try {
        await fetchWithAuth(API_BASE_URL, {
            method: 'POST',
            body: JSON.stringify(newTask)
        });
        taskForm.reset();
        fetchTasks();
    } catch (error) {
        if (!['Unauthorized', 'No token', 'Session expired'].includes(error.message)) {
            alert('Lỗi tạo công việc: ' + error.message);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Thêm Công Việc';
    }
});

// =============================================================
// 3. CẬP NHẬT TRẠNG THÁI — PUT /tasks/:id
// =============================================================
async function toggleTaskStatus(taskId, currentStatus) {
    const newStatus = currentStatus === 'pending' ? 'done' : 'pending';
    try {
        await fetchWithAuth(`${API_BASE_URL}/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        fetchTasks();
    } catch (error) {
        if (!['Unauthorized', 'No token', 'Session expired'].includes(error.message)) {
            alert('Lỗi cập nhật: ' + error.message);
        }
    }
}

// =============================================================
// 4. XÓA CÔNG VIỆC — DELETE /tasks/:id
// =============================================================
async function deleteTask(taskId) {
    if (!confirm('Bạn có chắc chắn muốn xóa công việc này?')) return;
    try {
        await fetchWithAuth(`${API_BASE_URL}/${taskId}`, { method: 'DELETE' });
        fetchTasks();
    } catch (error) {
        if (!['Unauthorized', 'No token', 'Session expired'].includes(error.message)) {
            alert('Lỗi xóa: ' + error.message);
        }
    }
}

// =============================================================
// RENDER UI & XSS PROTECTION
// =============================================================
function renderTasks(tasks) {
    taskList.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        taskList.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic text-center py-4">Chưa có công việc nào.</p>';
        return;
    }

    const priorityColors = {
        low:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        high:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    const priorityLabel = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };

    tasks.forEach(task => {
        const isDone = task.status === 'done';
        const taskEl = document.createElement('div');
        taskEl.className = `p-4 border dark:border-gray-700 rounded-lg flex justify-between items-center bg-white dark:bg-gray-800 shadow-sm transition-colors ${isDone ? 'opacity-60' : ''}`;

        taskEl.innerHTML = `
            <div>
                <h4 class="text-lg font-bold ${isDone ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'}">
                    ${escapeHtml(task.title)}
                </h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    ${escapeHtml(task.description || 'Không có mô tả')}
                </p>
                <div class="mt-2 flex gap-2 text-xs">
                    <span class="px-2 py-1 rounded-full ${priorityColors[task.priority] || priorityColors.low}">
                        Ưu tiên: ${priorityLabel[task.priority] || task.priority}
                    </span>
                    <span class="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        Hạn: ${task.dueDate}
                    </span>
                </div>
            </div>
            <div class="flex gap-2 ml-4 flex-shrink-0">
                <button
                    onclick="toggleTaskStatus('${task.taskId}', '${task.status}')"
                    class="px-3 py-1 rounded transition-colors text-sm font-medium ${isDone
                        ? 'bg-gray-200 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'}">
                    ${isDone ? 'Hoàn tác' : 'Hoàn thành'}
                </button>
                <button
                    onclick="deleteTask('${task.taskId}')"
                    class="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800 rounded transition-colors text-sm font-medium">
                    Xóa
                </button>
            </div>
        `;
        taskList.appendChild(taskEl);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(text)));
    return div.innerHTML;
}