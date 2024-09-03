import express from 'express';
import routes from './routes';

const port = process.env.PORT || 5000;
const app = express();

// Middleware to parse JSON
app.use(express.json({ limit: '50mb' }));
// Load all routes from routes/index.js
app.use(routes);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
