# 🎯 SINGLE POINT CONFIGURATION

## ✨ Super Simple Setup!

**Just change ONE line in ONE file and everything works!**

---

## 📝 How to Change Your IP Address

### **Step 1: Edit `config.json`**

Open the file `config.json` in the project root:

```json
{
  "current_ec2_ip": "54.158.225.97",  ← CHANGE THIS LINE!
  "backend_port": "8000",
  "frontend_port": "3000"
}
```

**That's it!** Just change the IP address on line 5.

---

### **Step 2: Rebuild Your Containers**

```bash
# SSH into your EC2 server
ssh -i "your-key.pem" ubuntu@YOUR_NEW_IP

# Navigate to project
cd /path/to/Shrone_Agent

# Rebuild and restart
docker-compose down
docker-compose up --build -d
```

---

## 🎉 What Happens Automatically?

When you change the IP in `config.json`, **EVERYTHING updates automatically**:

✅ **Backend CORS** (`main.py`)  
✅ **Frontend CORS** (`next.config.js`)  
✅ **API endpoints** (frontend → backend communication)  
✅ **Docker environment variables**  

**No more editing 10 different files!**

---

## 📋 Example

**Old IP:** `3.81.163.149`  
**New IP:** `54.158.225.97`

**Before:**
```json
{
  "current_ec2_ip": "3.81.163.149",
  ...
}
```

**After:**
```json
{
  "current_ec2_ip": "54.158.225.97",
  ...
}
```

Then just rebuild:
```bash
docker-compose up --build -d
```

**Done!** 🎉

---

## 🔍 Verify Configuration

After rebuilding, check the logs to confirm the IP was loaded:

```bash
docker logs shrone-backend | grep "Loaded configuration"
docker logs shrone-frontend | grep "loaded configuration"
```

You should see:
```
🌐 Loaded configuration: IP=54.158.225.97, Backend Port=8000, Frontend Port=3000
🔒 CORS configured for: 54.158.225.97
```

---

## 💡 Advanced: Custom Ports

If you need different ports:

```json
{
  "current_ec2_ip": "54.158.225.97",
  "backend_port": "9000",     ← Change backend port
  "frontend_port": "4000"     ← Change frontend port
}
```

**Remember to update docker-compose.yml ports too!**

---

## 🚨 Troubleshooting

**Problem:** CORS errors still appearing  
**Solution:** Make sure you rebuilt with `--build` flag:
```bash
docker-compose up --build -d  # ← The --build is important!
```

**Problem:** Changes not taking effect  
**Solution:** Clear Docker cache:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 🎯 Summary

**ONE FILE controls everything:** `config.json`  
**ONE LINE to change:** `"current_ec2_ip"`  
**ONE COMMAND to apply:** `docker-compose up --build -d`

**That's it!** No more CORS headaches! 🎉

