// ==================== CONFIGURATION ====================
const BACKEND_URL = "https://f2f66305-9c56-46df-9161-de37d7721cc7-00-1eb7koy2d6kei.sisko.replit.dev";

// ==================== GLOBAL VARIABLES ====================
let fileContent = null;
let processedResults = null;
let totalNumbers = 0;
let validNumbers = 0;
let invalidNumbers = 0;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    setupDragAndDrop();
    setupFileInput();
    console.log('✅ Frontend loaded. Backend URL:', BACKEND_URL);
});

// ==================== DRAG & DROP ====================
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', function() {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFile(files[0]);
    });
}

// ==================== FILE INPUT ====================
function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) handleFile(this.files[0]);
    });
}

function handleFile(file) {
    if (!file.name.endsWith('.txt')) {
        alert('Please select a .txt file');
        return;
    }
    
    const maxSize = document.getElementById('maxNumbers').value * 100;
    if (file.size > maxSize * 1024) {
        alert(`File is too large. Maximum allowed: ${maxSize}KB`);
        return;
    }
    
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').classList.remove('d-none');
    document.getElementById('processBtn').disabled = false;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        fileContent = e.target.result;
    };
    reader.readAsText(file);
}

// ==================== PROCESSING ====================
async function processFile() {
    if (!fileContent) {
        alert('Please select a file first');
        return;
    }
    
    resetResults();
    document.getElementById('progressContainer').classList.remove('d-none');
    
    const removePlusOne = document.getElementById('removePlusOne').checked;
    const filterInvalid = document.getElementById('filterInvalid').checked;
    const maxNumbers = parseInt(document.getElementById('maxNumbers').value);
    
    const lines = fileContent.split('\n');
    totalNumbers = Math.min(lines.length, maxNumbers);
    
    await processInChunks(lines, removePlusOne, filterInvalid, maxNumbers);
}

async function processInChunks(lines, removePlusOne, filterInvalid, maxNumbers) {
    const chunkSize = 1000;
    let currentIndex = 0;
    processedResults = { valid: [], invalid: [], byState: {} };
    
    function processChunk() {
        const endIndex = Math.min(currentIndex + chunkSize, totalNumbers);
        
        for (let i = currentIndex; i < endIndex; i++) {
            const line = lines[i].trim();
            if (line) processPhoneNumber(line, removePlusOne, filterInvalid);
            const progress = ((i + 1) / totalNumbers) * 100;
            updateProgress(progress);
        }
        
        currentIndex += chunkSize;
        
        if (currentIndex < totalNumbers) {
            setTimeout(processChunk, 10);
        } else {
            finishProcessing();
        }
    }
    
    processChunk();
}

function processPhoneNumber(number, removePlusOne, filterInvalid) {
    let cleaned = number;
    if (removePlusOne) cleaned = cleaned.replace(/^\+1/, '').replace(/^1/, '');
    cleaned = cleaned.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
        const areaCode = cleaned.substring(0, 3);
        if (isValidAreaCode(areaCode)) {
            const state = getStateFromAreaCode(areaCode);
            const formatted = `(${areaCode}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
            const result = { original: number, cleaned, formatted, areaCode, state, status: 'valid' };
            
            processedResults.valid.push(result);
            validNumbers++;
            
            if (!processedResults.byState[state]) processedResults.byState[state] = [];
            processedResults.byState[state].push(result);
            
        } else {
            processedResults.invalid.push({ original: number, cleaned, error: 'Invalid area code', status: 'invalid' });
            invalidNumbers++;
        }
    } else {
        processedResults.invalid.push({ original: number, cleaned, error: `Invalid length: ${cleaned.length} digits`, status: 'invalid' });
        invalidNumbers++;
    }
}

// ==================== BACKEND INTEGRATION ====================
async function finishProcessing() {
    setTimeout(() => {
        document.getElementById('progressContainer').classList.add('d-none');
    }, 500);
    
    // Update UI
    document.getElementById('totalCount').textContent = totalNumbers;
    document.getElementById('validCount').textContent = validNumbers;
    document.getElementById('invalidCount').textContent = invalidNumbers;
    document.getElementById('statesCount').textContent = Object.keys(processedResults.byState).length;
    
    displayStatesDistribution();
    createDownloadButtons();
    populateResultsTable();
    
    document.getElementById('resultsSection').classList.remove('d-none');
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
    
    // ✅ AUTOMATICALLY SAVE TO BACKEND
    await saveToBackend();
}

async function saveToBackend() {
    try {
        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];
        
        if (!file) {
            console.log('⚠️ No file to save');
            return;
        }
        
        console.log('📤 Uploading to backend:', file.name);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('results', JSON.stringify({
            total: totalNumbers,
            valid: validNumbers,
            invalid: invalidNumbers,
            states: Object.keys(processedResults.byState).length,
            stateDistribution: Object.keys(processedResults.byState),
            timestamp: new Date().toISOString()
        }));
        
        const response = await fetch(`${BACKEND_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend error: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Backend save successful:', result);
        
        showNotification(`✅ File saved to cloud storage! ${result.storedInDatabase ? '(Database + Storage)' : '(Storage Only)'}`, 'success');
        
    } catch (error) {
        console.warn('⚠️ Backend save failed:', error.message);
        showNotification('⚠️ Cloud save failed, but local processing completed', 'warning');
    }
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.backend-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `backend-notification alert alert-${type} alert-dismissible fade show`;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000; max-width: 400px;';
    notification.innerHTML = `
        <strong>${type === 'success' ? '✅' : '⚠️'}</strong> ${message}
        <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// ==================== UI FUNCTIONS ====================
function updateProgress(percentage) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${Math.round(percentage)}%`;
}

function displayStatesDistribution() {
    const statesList = document.getElementById('statesList');
    statesList.innerHTML = '';
    
    const states = Object.entries(processedResults.byState)
        .sort((a, b) => b[1].length - a[1].length);
    
    states.forEach(([state, numbers]) => {
        const stateDiv = document.createElement('div');
        stateDiv.className = 'state-card card mb-2';
        stateDiv.innerHTML = `
            <div class="card-body py-2">
                <div class="row align-items-center">
                    <div class="col-md-3"><span class="badge bg-primary">${state}</span></div>
                    <div class="col-md-6">
                        <div class="progress" style="height: 20px;">
                            <div class="progress-bar" role="progressbar" style="width: ${(numbers.length / validNumbers) * 100}%">
                                ${numbers.length} numbers
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 text-end">
                        <span class="badge bg-secondary">${((numbers.length / validNumbers) * 100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;
        statesList.appendChild(stateDiv);
    });
}

function createDownloadButtons() {
    const downloadButtons = document.getElementById('downloadButtons');
    downloadButtons.innerHTML = '';
    
    // All valid numbers
    const allValidBtn = document.createElement('button');
    allValidBtn.className = 'btn btn-success btn-sm me-2 mb-2';
    allValidBtn.innerHTML = '<i class="fas fa-download me-1"></i>All Valid Numbers';
    allValidBtn.onclick = () => downloadAllValidNumbers();
    downloadButtons.appendChild(allValidBtn);
    
    // State buttons
    Object.keys(processedResults.byState).forEach(state => {
        const stateBtn = document.createElement('button');
        stateBtn.className = 'btn btn-outline-primary btn-sm me-2 mb-2';
        stateBtn.innerHTML = `<i class="fas fa-download me-1"></i>${state}`;
        stateBtn.onclick = () => downloadStateNumbers(state);
        downloadButtons.appendChild(stateBtn);
    });
    
    // Invalid numbers
    if (processedResults.invalid.length > 0) {
        const invalidBtn = document.createElement('button');
        invalidBtn.className = 'btn btn-danger btn-sm me-2 mb-2';
        invalidBtn.innerHTML = `<i class="fas fa-download me-1"></i>Invalid Numbers (${processedResults.invalid.length})`;
        invalidBtn.onclick = () => downloadInvalidNumbers();
        downloadButtons.appendChild(invalidBtn);
    }
}

function populateResultsTable() {
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = '';
    
    const displayNumbers = processedResults.valid.slice(0, 100);
    
    displayNumbers.forEach((number, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><small>${number.original}</small></td>
            <td><strong>${number.cleaned}</strong></td>
            <td>${number.formatted}</td>
            <td><span class="badge bg-info">${number.areaCode}</span></td>
            <td><span class="badge bg-primary">${number.state}</span></td>
            <td><span class="badge bg-success">Valid</span></td>
        `;
        resultsBody.appendChild(row);
    });
    
    if (processedResults.valid.length > 100) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7" class="text-center text-muted">... and ${processedResults.valid.length - 100} more valid numbers</td>`;
        resultsBody.appendChild(row);
    }
}

// ==================== DOWNLOAD FUNCTIONS ====================
function downloadAllValidNumbers() {
    const content = processedResults.valid.map(n => n.formatted).join('\n');
    downloadFile('all-valid-numbers.txt', content);
}

function downloadStateNumbers(state) {
    const stateNumbers = processedResults.byState[state];
    const content = stateNumbers.map(n => n.formatted).join('\n');
    const filename = state.toLowerCase().replace(/\s+/g, '-') + '-numbers.txt';
    downloadFile(filename, content);
}

function downloadInvalidNumbers() {
    const content = processedResults.invalid.map(n => `${n.original} - ${n.error}`).join('\n');
    downloadFile('invalid-numbers.txt', content);
}

async function downloadAllAsZip() {
    const zip = new JSZip();
    const allValid = processedResults.valid.map(n => n.formatted).join('\n');
    zip.file("all-valid-numbers.txt", allValid);
    
    Object.entries(processedResults.byState).forEach(([state, numbers]) => {
        const content = numbers.map(n => n.formatted).join('\n');
        const filename = `states/${state.toLowerCase().replace(/\s+/g, '-')}.txt`;
        zip.file(filename, content);
    });
    
    if (processedResults.invalid.length > 0) {
        const invalidContent = processedResults.invalid.map(n => `${n.original} - ${n.error}`).join('\n');
        zip.file("invalid-numbers.txt", invalidContent);
    }
    
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "phone-numbers-results.zip");
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==================== UTILITIES ====================
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function resetResults() {
    processedResults = null;
    totalNumbers = validNumbers = invalidNumbers = 0;
    document.getElementById('totalCount').textContent = '0';
    document.getElementById('validCount').textContent = '0';
    document.getElementById('invalidCount').textContent = '0';
    document.getElementById('statesCount').textContent = '0';
    document.getElementById('resultsSection').classList.add('d-none');
}

// ==================== AREA CODE FUNCTIONS ====================
function getStateFromAreaCode(areaCode) {
    for (const [state, codes] of Object.entries(USA_STATES_AREA_CODES)) {
        if (codes.includes(areaCode)) return state;
    }
    return 'Unknown';
}

function isValidAreaCode(areaCode) {
    return ALL_AREA_CODES.has(areaCode);
}

// ==================== ADMIN PANEL LINK ====================
document.addEventListener('DOMContentLoaded', function() {
    // Add admin panel link to footer
    const cardFooter = document.querySelector('.card-footer');
    const adminLink = document.createElement('div');
    adminLink.className = 'mt-2';
    adminLink.innerHTML = `
        <a href="admin.html" target="_blank" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-user-shield me-1"></i>Admin Panel
        </a>
    `;
    cardFooter.appendChild(adminLink);
});
