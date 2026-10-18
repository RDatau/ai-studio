# Deployment Instructions

To run this full-stack application on Vercel, you need to configure it as a Node.js server.

1. Ensure your Vercel project is configured to use the Node.js runtime.
2. Ensure all required environment variables (like `GEMINI_API_KEY`) are set in the Vercel project settings under "Environment Variables".
3. The `vercel.json` is configured to route `/api/*` requests to `server.ts`. 

If you are still experiencing issues, ensure that your deployment is running the `server.ts` entry point instead of just serving static files. 
