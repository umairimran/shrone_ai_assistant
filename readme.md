# Sharon Agent - Document Q&A System

A full-stack document question-answering system built with FastAPI backend and Next.js frontend, using Supabase for vector storage and OpenAI for embeddings and language processing.

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- OpenAI API key
- Supabase account and project

### Backend Setup

1. **Create and activate virtual environment:**
   ```bash
python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install Python dependencies:**
   ```bash
pip install -r requirements.txt
```

3. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
OPENAI_API_KEY=your_openai_api_key_here
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
```

4. **Run the backend server:**
   ```bash
python main.py
```
   Keep this terminal open. The backend will run on `http://localhost:8000`

### Frontend Setup

1. **Open a new terminal** and navigate to the frontend directory:
   ```bash
cd frontend
```

2. **Install Node.js dependencies:**
   ```bash
npm install
```

3. **Set up frontend environment:**
   Create a `.env.local` file in the `frontend/` directory:
   ```env
BACKEND_URL=http://localhost:8000
```

4. **Run the frontend development server:**
   ```bash
npm run dev
```
   The frontend will run on `http://localhost:3000`

## 🎯 Usage

1. Open your browser and go to `http://localhost:3000`
2. Select a document category from the sidebar
3. Type your question in the chat input
4. Get AI-powered answers with citations

## 📁 Project Structure

```
├── main.py                 # FastAPI backend server
├── qa_config.py           # QA system configuration
├── build_embeddings.py    # Script to build embeddings for documents
├── frontend/              # Next.js frontend application
├── ingestion/             # Document processing modules
├── documents/             # Document storage
├── processed_output/      # Processed documents
└── requirements.txt       # Python dependencies
```

## 🔧 API Endpoints

- `GET /` - Health check
- `POST /v1/ask` - Ask questions about documents
- `GET /v1/qa-status` - Get QA system status
- `POST /v1/preprocess` - Upload and process documents

## 📝 Document Categories

- Board & Committee Proceedings
- Bylaws & Governance Policies  
- External Advocacy & Communications
- Policy & Position Statements
- Resolutions

## 🛠️ Development

### Building Embeddings
To process and embed new documents:
```bash
python build_embeddings.py
```

### Processing Documents
To preprocess documents:
```bash
python batch_preprocess.py
```

## 🔒 Environment Variables

### Backend (.env)
```env
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
```

### Frontend (.env.local)
```env
BACKEND_URL=http://localhost:8000
```

## 📊 Technology Stack

- **Backend**: FastAPI, LangChain, OpenAI, Supabase
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL with vector support)
- **AI/ML**: OpenAI GPT-4 and text-embedding-3-small

## 🏃‍♂️ Running Both Services

1. **Terminal 1 (Backend):**
   ```bash
# Activate venv and run backend
   source venv/bin/activate
   python main.py
```

2. **Terminal 2 (Frontend):**
   ```bash
# Navigate to frontend and run dev server
   cd frontend
   npm run dev
```

3. **Access the application:** Open `http://localhost:3000` in your browser

Both services need to be running simultaneously for the full application to work.# Sharon Agent - Document Q&A System

A full-stack document question-answering system built with FastAPI backend and Next.js frontend, using Supabase for vector storage and OpenAI for embeddings and language processing.

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- OpenAI API key
- Supabase account and project

### Backend Setup

1. **Create and activate virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   ```

4. **Run the backend server:**
   ```bash
   python main.py
   ```
   Keep this terminal open. The backend will run on `http://localhost:8000`

### Frontend Setup

1. **Open a new terminal** and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

3. **Set up frontend environment:**
   Create a `.env.local` file in the `frontend/` directory:
   ```env
   BACKEND_URL=http://localhost:8000
   ```

4. **Run the frontend development server:**
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:3000`

## 🎯 Usage

1. Open your browser and go to `http://localhost:3000`
2. Select a document category from the sidebar
3. Type your question in the chat input
4. Get AI-powered answers with citations

## 📁 Project Structure

```
├── main.py                 # FastAPI backend server
├── qa_config.py           # QA system configuration
├── build_embeddings.py    # Script to build embeddings for documents
├── frontend/              # Next.js frontend application
├── ingestion/             # Document processing modules
├── documents/             # Document storage
├── processed_output/      # Processed documents
└── requirements.txt       # Python dependencies
```

## 🔧 API Endpoints

- `GET /` - Health check
- `POST /v1/ask` - Ask questions about documents
- `GET /v1/qa-status` - Get QA system status
- `POST /v1/preprocess` - Upload and process documents

## 📝 Document Categories

- Board & Committee Proceedings
- Bylaws & Governance Policies  
- External Advocacy & Communications
- Policy & Position Statements
- Resolutions

## 🛠️ Development

### Building Embeddings
To process and embed new documents:
```bash
python build_embeddings.py
```

### Processing Documents
To preprocess documents:
```bash
python batch_preprocess.py
```

## 🔒 Environment Variables

### Backend (.env)
```env
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
```

### Frontend (.env.local)
```env
BACKEND_URL=http://localhost:8000
```

## 📊 Technology Stack

- **Backend**: FastAPI, LangChain, OpenAI, Supabase
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL with vector support)
- **AI/ML**: OpenAI GPT-4 and text-embedding-3-small

## 🏃‍♂️ Running Both Services

1. **Terminal 1 (Backend):**
   ```bash
   # Activate venv and run backend
   source venv/bin/activate
   python main.py
   ```

2. **Terminal 2 (Frontend):**
   ```bash
   # Navigate to frontend and run dev server
   cd frontend
   npm run dev
   ```

3. **Access the application:** Open `http://localhost:3000` in your browser

Both services need to be running simultaneously for the full application to work.