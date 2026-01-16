
import { GoogleGenAI } from "@google/genai";

// === Configuration ===
const CONFIG = {
    geminiApiKey: 'AIzaSyDHNMtfNs9-eesxliKl-J0IotHSAjO4zC4' // Extracted from config.ts
};

// === State Management ===
const state = {
    currentRoute: 'home',
    isLoading: false,
    role: '',
    analysisResult: null,
    error: null
};

// === Router ===
class Router {
    constructor() {
        this.routes = ['home', 'upload', 'results'];
        // Bind navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const route = e.target.closest('a').dataset.route;
                this.navigate(route);
            });
        });

        // Initial load
        this.navigate('home');
    }

    navigate(route) {
        if (!this.routes.includes(route)) return;

        // Update State
        state.currentRoute = route;

        // Update UI Classes
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${route}`).classList.remove('hidden');

        // Update Nav Active State
        document.querySelectorAll('.nav-link').forEach(link => {
            const linkRoute = link.dataset.route;
            if (linkRoute === route) {
                link.classList.add('text-[#EAEAEA]');
                link.classList.remove('text-[#B8B8B8]');
                link.querySelector('.underline-indicator').style.transform = 'scaleX(1)';
            } else {
                link.classList.remove('text-[#EAEAEA]');
                link.classList.add('text-[#B8B8B8]');
                link.querySelector('.underline-indicator').style.transform = 'scaleX(0)';
            }
        });

        // Special Route Logic
        if (route === 'results') {
            renderResults();
        }
    }
}

// === Resume Service (Logic) ===
class ResumeLogic {

    async analyze(file, role) {
        if (!CONFIG.geminiApiKey) throw new Error("API Key Missing");

        const mimeType = file.type;
        const isImage = mimeType.startsWith('image/');
        // const isPdf = mimeType === 'application/pdf'; // checked by input accept

        let base64Data;
        updateStatus("Preparing document...");

        if (isImage) {
            base64Data = await this.compressImage(file);
        } else {
            base64Data = await this.readFileAsBase64(file);
        }

        updateStatus("Consulting Gemini AI...");

        const ai = new GoogleGenAI({ apiKey: CONFIG.geminiApiKey });
        const prompt = `
      Act as a strict, senior-level technical recruiter and academic resume evaluator.
      Analyze this resume (provided as ${isImage ? 'an image' : 'a PDF document'}) specifically for the role of "${role}".
      ${isImage ? 'Perform OCR to extract all visible text before analyzing.' : ''}
      Produce a structured critique following these exact sections:
      
      1. OVERVIEW: 3-4 sentences summarizing the candidate's profile, years of experience, and primary domain.
      2. STRENGTHS: Specific bullet points referencing skills, experience, or achievements.
      3. SKILLS: Categorized into Languages, Frameworks, Databases, and Other.
      4. MISSING: Explicitly list missing or weak sections (e.g., Projects, Metrics) and explain why they matter.
      5. IMPROVEMENTS: Actionable advice. For each point, specify WHAT to improve, WHY it matters, and HOW to do it.
      6. ALIGNMENT: Analyze fit for "${role}". State match level (Low/Medium/High), gaps, and suggestions.
      7. PLAN: A prioritized list of 3-5 next steps.

      Return JSON matching this schema:
      {
        "score": number (0-100),
        "overview": string,
        "strengths": string[],
        "skills": { "languages": string[], "frameworks": string[], "databases": string[], "other": string[] },
        "missing": [{ "name": string, "importance": string }],
        "improvements": [{ "recommendation": string, "reason": string, "action": string }],
        "roleAlignment": { "matchLevel": string, "gaps": string[], "suggestions": string[] },
        "actionPlan": string[]
      }
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                role: 'user',
                parts: [
                    { inlineData: { mimeType: isImage ? 'image/jpeg' : mimeType, data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: 'application/json'
            }
        });

        const text = response.text();
        return JSON.parse(text);
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.src = url;
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxDim = 1500;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxDim) { height *= maxDim / width; width = maxDim; }
                } else {
                    if (height > maxDim) { width *= maxDim / height; height = maxDim; }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
            };
            img.onerror = reject;
        });
    }
}

// === UI Control ===
const router = new Router();
const resumeLogic = new ResumeLogic();

// Expose router to global scope for inline onclick handlers
window.router = router;

// Form Handling
const form = document.getElementById('upload-form');
const analyzeBtn = document.getElementById('analyze-btn');
const btnText = document.getElementById('btn-text');
const btnLoading = document.getElementById('btn-loading');
const errorMsg = document.getElementById('error-message');

function updateStatus(msg) {
    if (msg) {
        btnText.classList.add('hidden');
        btnLoading.classList.remove('hidden');
        btnLoading.textContent = msg;
    } else {
        btnText.classList.remove('hidden');
        btnLoading.classList.add('hidden');
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = document.getElementById('role-select').value;
    const fileInput = document.getElementById('resume-upload');
    const file = fileInput.files[0];

    if (!role || !file) return;

    try {
        state.isLoading = true;
        state.role = role;
        state.error = null;
        errorMsg.classList.add('hidden');
        analyzeBtn.disabled = true;

        state.analysisResult = await resumeLogic.analyze(file, role);

        router.navigate('results');
    } catch (err) {
        console.error(err);
        state.error = err.message || "An unknown error occurred";
        errorMsg.textContent = "ERROR: " + state.error;
        errorMsg.classList.remove('hidden');
    } finally {
        state.isLoading = false;
        analyzeBtn.disabled = false;
        updateStatus('');
    }
});

// Results Rendering
function renderResults() {
    const result = state.analysisResult;
    const noResults = document.getElementById('no-results');
    const resultsContent = document.getElementById('results-content');

    if (!result) {
        noResults.classList.remove('hidden');
        resultsContent.classList.add('hidden');
        return;
    }

    noResults.classList.add('hidden');
    resultsContent.classList.remove('hidden');

    // Helper to set text
    const setTxt = (id, txt) => document.getElementById(id).textContent = txt;

    setTxt('res-role', state.role);
    setTxt('res-score', result.score);
    setTxt('res-overview', result.overview);
    setTxt('res-match-level', result.roleAlignment.matchLevel);

    // Lists
    const createList = (id, items, fn) => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        items.forEach(item => el.innerHTML += fn(item));
    };

    createList('res-strengths', result.strengths, s => `
    <li class="flex items-start"><span class="text-[#C2B8A3] mr-3 mt-1.5 text-[10px]">●</span><span class="text-sm font-light text-[#EAEAEA]">${s}</span></li>
  `);

    // Skills
    const skillsContainer = document.getElementById('res-skills-container');
    skillsContainer.innerHTML = '';
    const addSkillSection = (title, skills) => {
        if (!skills?.length) return;
        let html = `<div><h4 class="text-[10px] uppercase text-[#555] mb-3 tracking-widest">${title}</h4><div class="flex flex-wrap gap-2">`;
        skills.forEach(s => html += `<span class="border border-[#333] px-3 py-1 text-xs text-[#EAEAEA]">${s}</span>`);
        html += `</div></div>`;
        skillsContainer.innerHTML += html;
    };
    addSkillSection('Languages', result.skills.languages);
    addSkillSection('Frameworks', result.skills.frameworks);
    addSkillSection('Databases', result.skills.databases);
    addSkillSection('Other', result.skills.other);

    // Improvements
    createList('res-improvements', result.improvements, (imp, i) => `
    <div class="border border-[#333] p-4 md:p-6 hover:border-[#555] transition-colors group">
      <div class="flex items-baseline gap-4 mb-4"><span class="text-lg font-bold text-[#333] group-hover:text-[#C2B8A3] transition-colors">IMP</span><h4 class="text-sm md:text-base font-medium text-[#EAEAEA]">${imp.recommendation}</h4></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div><span class="text-[10px] uppercase text-[#555] block mb-2 tracking-widest">Why</span><p class="text-xs md:text-sm text-[#B8B8B8] font-light">${imp.reason}</p></div>
        <div><span class="text-[10px] uppercase text-[#555] block mb-2 tracking-widest">Act</span><p class="text-xs md:text-sm text-[#EAEAEA] font-light">${imp.action}</p></div>
      </div>
    </div>
  `);

    // Role Alignment
    createList('res-gaps', result.roleAlignment.gaps, gap => `<li class="text-sm text-[#B8B8B8] font-light flex gap-2"><span>-</span> ${gap}</li>`);
    createList('res-suggestions', result.roleAlignment.suggestions, sug => `<li class="text-sm text-[#B8B8B8] font-light flex gap-2"><span>+</span> ${sug}</li>`);

    // Plan
    createList('res-plan', result.actionPlan, (step, i) => `
     <div class="flex items-start gap-4"><div class="min-w-[24px] h-[24px] border border-[#C2B8A3] rounded-full flex items-center justify-center text-[10px] text-[#C2B8A3] mt-0.5">${i + 1}</div><p class="text-sm md:text-base text-[#EAEAEA] font-light">${step}</p></div>
  `);
}
