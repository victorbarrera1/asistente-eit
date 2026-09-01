# EIT UDP Assistant 🎓✨

An enterprise-grade, AI-powered virtual assistant designed to guide students and answer inquiries regarding the **School of Informatics and Telecommunications (EIT)** at **Universidad Diego Portales (UDP)**.

**🔗 [Live Demo](https://chatudp.vercel.app/)**

---

## 🌟 Key Features

The chatbot serves as a centralized information hub for the faculty, providing precise answers across multiple areas of university life:

- **🎓 Professional Internships (*Prácticas Profesionales*):** Requirements, deadlines, student health insurance, and final report submission guidelines.
- **🏆 Graduation & Thesis Processes:** Annual academic calendars, thesis memory formatting, course registration, and post-defense regulations.
- **⚖️ Regulations & Policies:** Departmental bylaws, equipment loan policies, and academic statutes.
- **📋 Teaching Assistantships (*Ayudantías*):** Eligibility criteria, application windows, and stipend policies.
- **🥼 Laboratories:** Access rules and infrastructure safety protocols.
- **🔧 Academic Tools:** Software user guides and manuals (MATLAB, Azure, Canvas, Bizagi).
- **🩺 Student Welfare (*DAE*):** Mental health resources, socioeconomic evaluations, tuition-free coverage (*Gratuidad*), and student transit pass (*TNE*).
- **💼 Job Board:** Upcoming integration with the official UDP career portal.

---

## 🛠️ Enterprise Architecture (RAG Pipeline)

Evolved from an initial prototype into a **production-ready**, AI-driven platform engineered to eliminate hallucinations by strictly grounding generated responses in official institutional sources.

- **AI Engine (On-Premise GPU Inference):** Response generation and semantic search powered by **Meta Llama 3.1 8B** and **BGE-M3 (1024d)** hosted directly on the university's internal **AI Server** via **Ollama**, completely eliminating third-party cloud API limits, subscription costs, and external data leakage.
- **Vector Database:** **Supabase** (PostgreSQL + `pgvector`) for vector storage and high-performance similarity search.
- **Atomic Scraping & Semantic Chunking:** An automated Node.js scraping pipeline crawls official web portals (`eit.udp.cl` and `dae.udp.cl`), cleans HTML overhead, performs paragraph-aware semantic chunking, and ingests vectorized data using secure transactional batch workflows (Batch IDs).
- **Query Rewriting:** Features dynamic detection of Chilean student slang and colloquial terms (*e.g., "profe", "cachai"*), normalizing queries on the backend prior to vector retrieval to significantly boost search recall and precision.

---

## 🎨 Premium Frontend & UX (Apple-Inspired Aesthetic)

The user interface was crafted with meticulous attention to detail to deliver a polished, intuitive user experience:

- **Tech Stack:** React + Vite + Tailwind CSS v4.
- **Clean Pill Design & Dark Mode:** Features responsive pill navigation, modern dark/light mode toggle, and micro-interactions optimized for speed and clarity.
- **Built-in Feedback System:** Integrated 5-star rating component that persists response evaluation metrics directly to the database for continuous model fine-tuning.
- **PDF Export:** One-click native feature allowing users to export full chat transcripts directly to PDF.

---

## 🔒 Security & Performance

- **Rate Limiting:** Guards against API abuse by throttling concurrent requests and mitigating denial-of-service (DoS) vectors.
- **Robust Sanitization:** Strict request header validation, encrypted admin session cookies (protecting sensitive administration endpoints), and comprehensive input sanitization.
- **Serverless & Self-Hosted Ready:** Production builds support both **Node.js / Dokku** on-premise container deployments and serverless environments.

---

## 🏛️ Institutional Deployment & GitLab Integration

The project is hosted within the university's private infrastructure (**EIT UDP**):

| Phase | Milestone | Status | Description |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **GitLab EIT Migration** | ✅ **Done** | Codebase repository created and linked under the official `practicas/asistente-eit` group on `giteit.udp.cl`. |
| **Phase 2** | **CI/CD & Dokku Pipeline** | ✅ **Done** | Automated deployment pipeline configured via `.gitlab-ci.yml` and `Procfile`, targeting the university's internal server (internal Dokku server). |
| **Phase 3** | **Secure Secrets Provisioning** | ✅ **Done** | Persistent runtime environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`) successfully provisioned in Dokku via SSH. |
| **Phase 4** | **On-Premise AI Server (On-Premise GPU / Ollama)** | ✅ **Done** | Complete migration from Google Gemini to local **Llama 3.1 8B + BGE-M3 (1024d)** running on **On-Premise AI Server**. |
| **Phase 5** | **Official Domain & Public Subdomain** | 🟡 **In Progress** | External DNS mapping (`*.eit.udp.cl`) and reverse proxy SSL setup for full institutional public access. |

---

## 👥 Community & Development

An open-source initiative developed for and by the student community of the School of Informatics and Telecommunications (EIT) at Universidad Diego Portales (UDP).

---

## 🤝 Open Source & Contributing

This project is **Open Source**. I strongly believe in the power of community-driven development and open collaboration to build better tools for our university.

Contributions, feature suggestions, and Pull Requests are highly welcome! Feel free to fork the repository, explore the codebase, and submit your improvements.

---

## 📄 License

```text
MIT License

Copyright (c) 2026 EIT UDP Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
