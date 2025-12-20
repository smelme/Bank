# Adding PostgreSQL Database to Railway

## Steps to Enable Database Persistence on Railway

1. **Go to your Railway Project Dashboard**
   - Visit: https://railway.app/project/your-project-id

2. **Add PostgreSQL Plugin**
   - Click "+ New" button
   - Select "Database" → "Add PostgreSQL"
   - Railway will automatically provision a PostgreSQL database

3. **Connect to Your Service**
   - The PostgreSQL plugin will automatically set the `DATABASE_URL` environment variable
   - Your service will automatically detect and use the database on next deployment

4. **Verify Connection**
   - After deployment, check the logs
   - You should see: `Database connection pool initialized` and `Database tables initialized successfully`
   - If DATABASE_URL is not set, you'll see: `No DATABASE_URL provided, using in-memory storage`

5. **Database Schema**
   - Tables are created automatically on first startup
   - No manual SQL scripts needed
   - Schema includes:
     - `accounts` table (customer data with face descriptors)
     - `sessions` table (active login sessions)
     - Indexes for optimized queries

## Benefits of Using Database

- ✅ **Data Persistence**: Accounts survive across deployments and restarts
- ✅ **Session Management**: Users stay logged in across server restarts
- ✅ **Scalability**: Can handle multiple server instances
- ✅ **Automatic Cleanup**: Expired sessions are cleaned up every hour

## Fallback Behavior

If DATABASE_URL is not set:
- System automatically uses in-memory storage
- Works locally without any setup
- Perfect for development and testing
- Data is lost when server restarts

## Cost

Railway PostgreSQL pricing:
- **Hobby Plan**: $5/month (includes 5 GB storage)
- **Pro Plan**: Pay-as-you-go (starts at $0.01/GB/month)
- Database usage is metered separately from compute

## Local Development with Database

To use PostgreSQL locally:

```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Create database
createdb tamange_bank

# Set environment variable
export DATABASE_URL="postgresql://localhost:5432/tamange_bank"

# Start server
npm start
```

**Windows:**
```powershell
# Download and install from: https://www.postgresql.org/download/windows/

# Set environment variable
$env:DATABASE_URL="postgresql://localhost:5432/tamange_bank"

# Start server
npm start
```

## Monitoring

Check Railway logs for database activity:
- Look for "Account created in database:" messages
- Watch for session creation/deletion logs
- Monitor "Database connection pool initialized" on startup

## Troubleshooting

**Problem**: "No DATABASE_URL provided, using in-memory storage"
- **Solution**: Make sure PostgreSQL plugin is added and linked to your service

**Problem**: Database connection errors
- **Solution**: Check Railway dashboard → PostgreSQL → Logs for errors

**Problem**: Tables not created
- **Solution**: Check server logs for "Error setting up database tables"
- Ensure PostgreSQL version is compatible (PostgreSQL 12+)

## Security

- DATABASE_URL includes credentials - never commit to git
- Railway manages encryption and security automatically
- SSL is enabled by default for Railway-hosted databases
- Connection pooling prevents connection exhaustion
