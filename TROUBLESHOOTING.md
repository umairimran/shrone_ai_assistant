# 🔧 Troubleshooting Document Loading Issue

## ✅ **What I've Fixed:**

1. **Environment Variable Access** - Created proper config system
2. **Added Debugging** - Console logs to track what's happening
3. **Added Backend Tests** - Verify connection before loading documents

## 🔍 **Debug Steps:**

### 1. **Check Browser Console**
Open your deployed app and check the browser console for these logs:

```
🔍 Debug Config:
NEXT_PUBLIC_BACKEND_URL: http://34.229.232.41:8000
NODE_ENV: production
Backend URL: http://34.229.232.41:8000

🧪 Testing backend connection...
Backend URL: http://34.229.232.41:8000
Backend response status: 200
✅ Backend connection successful

🧪 Testing documents endpoint...
Documents endpoint response status: 200
✅ Documents endpoint successful, found X documents
```

### 2. **Check Docker Logs**
```bash
# Check frontend logs
docker logs shrone-frontend

# Check backend logs  
docker logs shrone-backend
```

### 3. **Test Backend Directly**
```bash
# Test if backend is accessible
curl http://34.229.232.41:8000/health

# Test documents endpoint
curl "http://34.229.232.41:8000/documents_by_category/Board%20and%20Committee%20Proceedings"
```

## 🚨 **Common Issues & Solutions:**

### Issue 1: Environment Variable Not Set
**Symptoms:** Console shows `NEXT_PUBLIC_BACKEND_URL: Not set`
**Solution:** 
```bash
# In docker-compose.yml, make sure you have:
environment:
  - NEXT_PUBLIC_BACKEND_URL=http://34.229.232.41:8000
```

### Issue 2: Backend Not Accessible
**Symptoms:** `❌ Backend connection failed`
**Solution:**
1. Check if backend is running: `docker ps`
2. Check backend logs: `docker logs shrone-backend`
3. Verify IP address is correct

### Issue 3: CORS Issues
**Symptoms:** Network errors in console
**Solution:** Check if backend has CORS configured for your frontend domain

### Issue 4: Documents Endpoint Returns Empty
**Symptoms:** `✅ Documents endpoint successful, found 0 documents`
**Solution:**
1. Check if documents exist in backend
2. Verify category names match exactly
3. Check backend database/vector store

## 🔧 **Quick Fixes:**

### Fix 1: Rebuild and Restart
```bash
docker-compose down
docker-compose up -d --build
```

### Fix 2: Clear Browser Cache
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

### Fix 3: Check Environment Variables
```bash
# Check if environment variable is set in container
docker exec shrone-frontend printenv | grep BACKEND
```

## 📋 **What to Check Next:**

1. **Open your deployed app**
2. **Go to Management page**
3. **Open browser console (F12)**
4. **Look for the debug logs above**
5. **Share the console output** so I can help further

The debug logs will tell us exactly where the issue is!
