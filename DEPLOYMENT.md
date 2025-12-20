# Railway Deployment Guide

## Prerequisites
- GitHub account
- Railway account (sign up at https://railway.app)
- Repository pushed to GitHub

## Step 1: Push to GitHub

```bash
# Initialize git repository
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Tamange Bank Digital ID Verifier"

# Add remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git push -u origin main
```

## Step 2: Deploy to Railway

1. **Go to Railway Dashboard**
   - Visit https://railway.app
   - Click "New Project"

2. **Deploy from GitHub**
   - Click "Deploy from GitHub repo"
   - Authorize Railway to access your GitHub account
   - Select your repository (`Verifier` or whatever you named it)

3. **Configure Environment Variables**
   After deployment starts, go to your project settings and add:
   
   - **Variable Name:** `ORIGIN`
   - **Variable Value:** `https://YOUR-APP-NAME.railway.app` (Railway will show you your URL)
   
   Note: You'll need to update this after you see your Railway URL

4. **Update ORIGIN after first deployment**
   - Once deployed, Railway will give you a URL like `https://verifier-production-xxxx.up.railway.app`
   - Go to Variables tab
   - Set `ORIGIN` to your actual Railway URL (including https://)
   - Railway will automatically redeploy

## Step 3: Configure CORS (if needed)

If you need to allow specific origins, update the CORS configuration in `server.js`:

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
```

Then add environment variable:
- **Variable Name:** `ALLOWED_ORIGINS`
- **Variable Value:** `https://your-frontend-domain.com,https://another-domain.com`

## Step 4: Test Your Deployment

1. Visit your Railway URL
2. Test the registration flow with Digital ID
3. Test the sign-in flow with biometric verification

## Important Notes

### Current Limitations
- **Session Storage:** Using in-memory Maps (will reset on server restart)
- **Account Storage:** Using in-memory Maps (data will be lost on restart)

### For Production
You should add a database (PostgreSQL) for:
- Session management
- Account storage
- Biometric face descriptor storage

Railway makes it easy to add PostgreSQL:
1. Go to your project in Railway
2. Click "New" → "Database" → "Add PostgreSQL"
3. Railway will automatically set `DATABASE_URL` environment variable

## Environment Variables Summary

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Railway) | `3001` |
| `ORIGIN` | Your app's URL for credential verification | `https://verifier-production.up.railway.app` |
| `ALLOWED_ORIGINS` | (Optional) Comma-separated list of allowed CORS origins | `https://example.com` |
| `DATABASE_URL` | (Future) PostgreSQL connection string | Auto-set by Railway |

## Troubleshooting

### Build Fails
- Check Railway logs in the "Deployments" tab
- Ensure `package.json` has correct `start` script
- Verify Node.js version compatibility

### App Crashes
- Check Runtime logs
- Verify all environment variables are set correctly
- Ensure `ORIGIN` matches your Railway URL exactly (including https://)

### Digital ID Not Working
- Verify `ORIGIN` environment variable is set to your Railway URL
- Check browser console for CORS errors
- Ensure HTTPS is being used (Railway provides this automatically)

## Need Database Integration?

Let me know if you'd like me to add PostgreSQL integration for persistent storage!
