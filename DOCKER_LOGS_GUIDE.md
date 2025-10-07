# 📋 Docker Logs Commands

## 🔍 **View Frontend Logs:**
```bash
# View all frontend logs
sudo docker logs shrone-frontend

# View last 50 lines
sudo docker logs --tail 50 shrone-frontend

# Follow logs in real-time
sudo docker logs -f shrone-frontend

# View logs with timestamps
sudo docker logs -t shrone-frontend
```

## 🔍 **View Backend Logs:**
```bash
# View all backend logs
sudo docker logs shrone-backend

# View last 50 lines
sudo docker logs --tail 50 shrone-backend

# Follow logs in real-time
sudo docker logs -f shrone-backend
```

## 🔍 **View All Container Logs:**
```bash
# View logs from all containers
sudo docker-compose logs

# Follow all logs
sudo docker-compose logs -f

# View specific service logs
sudo docker-compose logs frontend
sudo docker-compose logs backend
```

## 🔍 **What to Look For:**

### ✅ **Good Signs:**
```
🔍 [CONFIG] NEXT_PUBLIC_BACKEND_URL: http://34.229.232.41:8000
🧪 [TEST] Backend connection successful
✅ [CACHE] Cached X documents for [category]
```

### ❌ **Error Signs:**
```
❌ [TEST] Backend connection failed: 500 Internal Server Error
❌ [CACHE] Failed to fetch [category]: 404 Not Found
🔍 [CONFIG] NEXT_PUBLIC_BACKEND_URL: Not set
```

## 🚀 **Quick Debug Steps:**

1. **Check if containers are running:**
   ```bash
   sudo docker ps
   ```

2. **Check frontend logs:**
   ```bash
   sudo docker logs shrone-frontend | grep -E "(CONFIG|TEST|CACHE|ERROR)"
   ```

3. **Check backend logs:**
   ```bash
   sudo docker logs shrone-backend | tail -20
   ```

4. **Restart if needed:**
   ```bash
   sudo docker-compose restart frontend
   ```

## 📊 **Log Categories:**
- `[CONFIG]` - Environment variable configuration
- `[TEST]` - Backend connection tests
- `[CACHE]` - Document cache operations
- `[ERROR]` - Error messages
