# Deployment Guide - IP Address Configuration

## ✅ Fixed Issues

I've fixed the main issue where documents weren't showing in production:

1. **Fixed DocumentCacheService.ts** - Now uses environment variable instead of hardcoded localhost
2. **Updated docker-compose.yml** - Added the required environment variable

## 🔧 Where to Put Your IP Address

### Option 1: Update docker-compose.yml (Recommended for Docker deployment)

In your `docker-compose.yml` file, update the frontend service environment variables:

```yaml
frontend:
  build:
    context: ./frontend_2
    dockerfile: Dockerfile
  container_name: shrone-frontend
  ports:
    - "3000:3000"
  environment:
    - NEXT_TELEMETRY_DISABLED=1
    - BACKEND_URL=http://YOUR_EC2_IP:8000
    - NEXT_PUBLIC_BACKEND_URL=http://YOUR_EC2_IP:8000
  depends_on:
    - backend
  restart: unless-stopped
```

**Replace `YOUR_EC2_IP` with your actual EC2 public IP address (e.g., `34.229.232.41`)**

### Option 2: Create .env file (Alternative method)

Create a `.env` file in your project root with:

```bash
NEXT_PUBLIC_BACKEND_URL=http://YOUR_EC2_IP:8000
BACKEND_URL=http://YOUR_EC2_IP:8000
```

### Option 3: Set environment variables in GitHub Actions

In your `.github/workflows/deploy.yml`, add environment variables:

```yaml
- name: Deploy to EC2 Server
  run: |
    ssh -o StrictHostKeyChecking=no ubuntu@${{ secrets.EC2_HOST }} << 'EOF'
      cd /home/ubuntu/Sharon_Agent
      # Set environment variables
      export NEXT_PUBLIC_BACKEND_URL=http://${{ secrets.EC2_HOST }}:8000
      export BACKEND_URL=http://${{ secrets.EC2_HOST }}:8000
      # Reset any local changes and clean untracked files
      git fetch origin
      git reset --hard origin/main
      git clean -fd
      # Rebuild and restart Docker containers
      docker-compose down
      docker-compose up -d --build
    EOF
```

## 🚀 Deployment Steps

1. **Update the IP address** in `docker-compose.yml` (Option 1 above)
2. **Commit and push** your changes:
   ```bash
   git add .
   git commit -m "Fix document loading in production"
   git push origin main
   ```
3. **Deploy** using your GitHub Actions workflow or manually:
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

## 🔍 How to Verify the Fix

1. **Check browser console** for these logs:
   - `🌐 Using backend URL: http://YOUR_IP:8000`
   - `✅ Cached X documents for [category]`

2. **Check if documents load** in the management page

3. **Test document viewing** functionality

## 🐛 Troubleshooting

If documents still don't show:

1. **Check backend is running**: `curl http://YOUR_IP:8000/health`
2. **Check frontend logs**: `docker logs shrone-frontend`
3. **Check backend logs**: `docker logs shrone-backend`
4. **Clear browser cache** and localStorage
5. **Verify CORS** settings in your backend

## 📝 Summary of Changes Made

1. **DocumentCacheService.ts**: 
   - Added environment variable support
   - Now uses `process.env.NEXT_PUBLIC_BACKEND_URL` instead of hardcoded localhost

2. **docker-compose.yml**:
   - Added `NEXT_PUBLIC_BACKEND_URL=http://backend:8000` environment variable

The key issue was that your frontend was trying to call `http://localhost:8000` which doesn't work in production. Now it will use the correct backend URL from environment variables.
