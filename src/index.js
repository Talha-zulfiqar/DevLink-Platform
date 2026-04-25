const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
console.log('📂 .env loaded from:', path.resolve(__dirname, '..', '.env'));
console.log('🔑 GEMINI_API_KEY available:', !!process.env.GEMINI_API_KEY);
console.log('🔑 GROQ_API_KEY available:', !!process.env.GROQ_API_KEY);
if (process.env.GROQ_API_KEY) {
  console.log('   Full key:', process.env.GROQ_API_KEY);
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const http = require('http');
const { initSocket } = require('./socket');
const util = require('util');

const app = express();

// Video provider (Daily.co) integration removed. The app now uses native WebRTC + Socket.IO for real-time calls.
console.log('ℹ️ Video provider removed: using WebRTC + Socket.IO for calls')

// Security headers
// Disable Helmet CSP and related cross-origin policies to avoid CSP
// headers injected by browser extensions (uBlock/AdBlock) conflicting
// with Vite HMR and inline style/script used in development. This
// change removes Helmet's CSP header entirely. (Per your request.)
try {
	app.use(helmet({
		contentSecurityPolicy: false,
		crossOriginEmbedderPolicy: false,
		crossOriginResourcePolicy: false,
	}));
	console.log('ℹ️ Helmet CSP and cross-origin policies disabled (contentSecurityPolicy=false)');
} catch (e) {
	console.warn('⚠️ Failed to disable Helmet CSP options; falling back to default Helmet():', e && e.message ? e.message : e);
	try { app.use(helmet()); } catch (e2) { /* ignore */ }
}

// Dev-only response header logger: prints the headers Express has set
// for each response when it finishes. This helps confirm whether the
// server is the source of a Content-Security-Policy header (vs browser
// extensions). Enabled only when NODE_ENV !== 'production'.
if ((process.env.NODE_ENV || 'development') !== 'production') {
	app.use((req, res, next) => {
		res.on('finish', () => {
			try {
				console.log('=== RESPONSE HEADERS ===', req.method, req.originalUrl, 'status=', res.statusCode);
				// Print a compact copy of headers so logs are readable
				const headers = res.getHeaders ? res.getHeaders() : (res._headers || {});
				console.log(headers);
			} catch (e) {
				console.warn('Header logger error', e && e.message ? e.message : e);
			}
		});
		next();
	});
}

// Defensive dev-only middleware: ensure no Content-Security-Policy header is sent from Express in development.
// Some environments or proxies may still add CSP headers; this middleware removes them for local dev so Vite
// can perform HMR and style injection reliably. This runs only when NODE_ENV !== 'production'.
if ((process.env.NODE_ENV || 'development') !== 'production') {
	app.use((req, res, next) => {
		try {
			// Remove common CSP headers if present
			res.removeHeader && res.removeHeader('Content-Security-Policy');
			res.removeHeader && res.removeHeader('Content-Security-Policy-Report-Only');
		} catch (e) {
			// ignore
		}
		return next();
	});
}

// Logging (only in development by default)
if ((process.env.NODE_ENV || 'development') === 'development') {
	app.use(morgan('dev'));
}

// CORS - for local development keep permissive to allow frontend dev servers on any localhost port.
// For production deployments consider setting CLIENT_URL and tightening this.
app.use(
	cors({
		origin: true,
		credentials: true,
	})
);

// Body parser
// Stripe webhook needs the raw body; we'll mount a raw handler for the webhook route below before the json parser is used
app.use(express.json());

// Health check (simple)
app.get('/api/health', (req, res) => {
	try {
		const dbState = mongoose.connection && typeof mongoose.connection.readyState === 'number' ? mongoose.connection.readyState : 0;
		const dbStatus = dbState === 1 ? 'connected' : (dbState === 2 ? 'connecting' : 'disconnected');
		return res.json({ success: true, data: { server: 'ok', db: dbStatus, env: process.env.NODE_ENV || 'development' } });
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Health check failed', error: err && err.message ? err.message : String(err) });
	}
});
 

// Simple rate limiter (only enabled in production by default)
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
});
if ((process.env.NODE_ENV || 'development') === 'production') {
	app.use(limiter);
} else {
	console.log('ℹ️ Rate limiter disabled in non-production environment (NODE_ENV=' + (process.env.NODE_ENV || 'development') + ')');
}

// Connect to database
connectDB();

// Development: verbose Mongoose operation logging to help trace missing writes.
// This will log collection, method, query and document for every mongoose operation.
try {
	mongoose.set('debug', function (collectionName, method, query, doc) {
		try {
			console.log('🗄️ MONGODB OPERATION:');
			console.log('   Collection:', collectionName);
			console.log('   Method:', method);
			console.log('   Query:', util.inspect(query, { depth: 6 }));
			console.log('   Document:', util.inspect(doc, { depth: 6 }));
		} catch (e) {
			console.warn('Mongoose debug inspect error:', e && e.message ? e.message : e);
		}
	});
} catch (e) {
	console.warn('Failed to enable mongoose debug logging:', e && e.message ? e.message : e);
}

// More explicit connection event logging
mongoose.connection.on('connected', () => {
	const uri = (mongoose.connection.client && mongoose.connection.client.s && mongoose.connection.client.s.url) || process.env.MONGODB_URI || process.env.MONGO_URI || 'unknown';
	console.log('✅ MONGODB CONNECTED - URI:', uri);
});

mongoose.connection.on('error', (err) => {
	console.error('❌ MONGODB ERROR:', err && err.message ? err.message : err);
});

// Wait for MongoDB to become available (with timeout) before starting the HTTP server.
const waitForMongo = (timeoutMs = 10000) => new Promise((resolve, reject) => {
	const start = Date.now();
	const tick = async () => {
		try {
			const state = mongoose.connection && typeof mongoose.connection.readyState === 'number' ? mongoose.connection.readyState : 0;
			if (state === 1) return resolve(); // connected
			if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for MongoDB')); 
			setTimeout(tick, 250).unref();
		} catch (e) {
			return reject(e);
		}
	};
	tick();
});
// Routes
app.use('/api/auth', authRoutes);
// Profiles (user profile management and mentor search)
app.use('/api/profiles', require('./routes/profiles'));
// Bookings (session scheduling)
app.use('/api/bookings', require('./routes/bookings'));
// Activities (recent user events)
app.use('/api/activities', require('./routes/activities'));
// User analytics (dashboard)
try {
	app.use('/api/user/analytics', require('./routes/userAnalytics'));
} catch (e) {
	console.warn('User analytics route not available:', e && e.message ? e.message : e);
}
// Posts (social feed)
app.use('/api/posts', require('./routes/posts'));
// Legacy /api/video route retained but returns a deprecation response; native WebRTC is used client-side
app.use('/api/video', require('./routes/video'));
// WebRTC helper endpoints (TURN credentials) - optional
app.use('/api/webrtc', require('./routes/webrtc'));
// Dev helpers (only in development)
if ((process.env.NODE_ENV || 'development') === 'development') {
	try {
		app.use('/api/dev', require('./routes/dev'))
		// Mount test helpers for activation (development only)
		try {
			app.use('/api/test', require('./routes/test'))
		} catch (e) {
			console.warn('Test routes not available:', e && e.message)
		}
	} catch (e) {
		console.warn('Dev routes not available:', e && e.message)
	}
}
// Reports
app.use('/api/reports', require('./routes/reports'));
// Users (public profiles)
app.use('/api/users', require('./routes/users'));
// Uploads (file management)
try { app.use('/api/uploads', require('./routes/uploads')) } catch (e) { console.warn('Uploads route not available:', e && e.message) }
// Comments (post comments endpoints)
app.use('/api', require('./routes/comments'));
// Messages (recent message previews)
app.use('/api/messages', require('./routes/messages'));
// Conversations (chat-level operations: delete convo)
app.use('/api/conversations', require('./routes/conversations'));
// Projects (real-world project postings)
try { app.use('/api/projects', require('./routes/projects')) } catch (e) { console.warn('Projects route not available:', e && e.message ? e.message : e) }
// Organization management (projects, tasks, resources, team)
try { app.use('/api/organization', require('./routes/organization')) } catch (e) { console.warn('Organization route not available:', e && e.message ? e.message : e) }
// Tasks routes (assigned tasks & progress updates)
try { app.use('/api/tasks', require('./routes/tasks')) } catch (e) { console.warn('Tasks route not available:', e && e.message ? e.message : e) }
// Payments (Stripe integration)
app.use('/api/payments', require('./routes/payments'));
// Ratings for mentors/senior developers
try { app.use('/api/ratings', require('./routes/ratings')) } catch (e) { console.warn('Ratings route not available:', e && e.message ? e.message : e) }
// Withdrawals for mentor earnings
try { app.use('/api/withdrawals', require('./routes/withdrawals')) } catch (e) { console.warn('Withdrawals route not available:', e && e.message ? e.message : e) }
// Notifications (real-time)
try { app.use('/api/notifications', require('./routes/notifications')) } catch (e) { console.warn('Notifications route not available:', e && e.message ? e.message : e) }

// Mount admin routes
app.use('/api/admin', require('./routes/admin'));
// Admin revenue analytics route
try {
	app.use('/api/admin/revenue', require('./routes/adminRevenue'))
} catch (e) {
	console.warn('Admin revenue routes not available:', e && e.message ? e.message : e)
}
// Admin mentor applications routes (separate module)
try {
	app.use('/api/admin/mentor-applications', require('./routes/adminMentorApplications'));
} catch (e) {
	console.warn('Admin mentor applications routes not available:', e && e.message ? e.message : e);
}

// Stripe webhook endpoint MUST use raw body parsing to verify signature.
// We mount it explicitly and use the exported handler from the payments router.
try {
	const paymentsModule = require('./routes/payments');
	app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => paymentsModule.handleStripeWebhook(req, res));
} catch (e) {
	console.warn('Payments route not available for webhook mounting:', e.message);
}

app.get('/', (req, res) => res.json({ success: true, message: 'DevLink API' }));

// Debug endpoint to list all users (useful in development)
app.get('/api/debug/users', async (req, res) => {
	try {
		const User = require('./models/User');
		const users = await User.find({});
		console.log('=== DEBUG: ALL USERS ===');
		users.forEach((user) => {
			const name = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
			console.log(`- ${name || '<no-name>'} | isMentor: ${user.isMentor} | email: ${user.email}`);
		});

		res.json({
			totalUsers: users.length,
			users: users.map((u) => ({
				name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
				email: u.email,
				isMentor: !!u.isMentor,
				id: u._id,
			})),
		});
	} catch (error) {
		console.error('DEBUG /api/debug/users error:', error);
		res.status(500).json({ error: error.message });
	}
});

// Mentors lookup logic (extracted so we can expose multiple routes that return the same data)
const mentorsHandler = async (req, res) => {
	try {
		const User = require('./models/User');
		console.log('🔍 Fetching session providers (mentors & juniors) from database...');

		// Return users who can provide sessions: role mentor OR junior, and are currently available.
		// Keep legacy flags isMentor / isMentorVerified for backwards compatibility.
		const filter = {
			isActive: true,
			isAvailable: true,
			$or: [
				{ role: 'mentor' },
				{ role: 'junior' },
				{ isMentor: true },
				{ isMentorVerified: true },
			],
		};

		const mentors = await User.find(filter).select('firstName lastName name email role avatar bio hourlyRate rating expertiseAreas availabilitySlots skills experienceLevel pricePerHour mentorBio');

		console.log(`✅ Found ${mentors.length} session providers:`);
		mentors.forEach((m) => {
			const name = m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim();
			console.log(`   - ${name || '<no-name>'} | role: ${m.role} | email: ${m.email}`);
		});

		const out = mentors.map((m) => ({
			id: m._id,
			firstName: m.firstName,
			lastName: m.lastName,
			name: m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim(),
			email: m.email,
			role: m.role,
			skills: m.skills && m.skills.length ? m.skills : (m.expertiseAreas || []),
			bio: m.mentorBio || m.bio || '',
			hourlyRate: m.hourlyRate || m.pricePerHour || null,
			rating: m.rating || null,
			availabilitySlots: m.availabilitySlots || [],
			avatar: m.avatar || null,
		}));

		res.json({ success: true, count: out.length, data: { results: out } });
	} catch (error) {
		console.error('❌ Mentors API error:', error);
		res.status(500).json({ success: false, error: error.message });
	}
};

// Expose both endpoints so older frontend code continues to work:
app.get('/api/mentors', mentorsHandler);
app.get('/api/profiles/mentors', mentorsHandler);

// Serve uploaded files from project-root /uploads at /uploads
try {
	const uploadsDir = path.join(process.cwd(), 'uploads')
	// ensure directory exists
	const fs = require('fs')
	try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }) } catch (e) { console.warn('Failed to ensure uploads exists:', e && e.message ? e.message : e) }
	app.use('/uploads', express.static(uploadsDir))
} catch (e) {
	console.warn('Failed to mount /uploads static:', e && e.message ? e.message : e)
}

// Global error handler to ensure all errors return valid JSON
app.use((err, req, res, next) => {
	console.error('Global error handler:', err && err.stack ? err.stack : err)
	if (res.headersSent) return next(err)
	const status = (err && err.status) || 500
	res.status(status).json({ success: false, message: (err && err.message) || 'Server error' })
})
// Database info endpoint - MOVE THIS UP
app.get('/api/debug/db-info', async (req, res) => {
  try {
    const User = require('./models/User');
    const db = mongoose.connection.db;
    
    const stats = await db.stats();
    const collections = await db.listCollections().toArray();
    const userCount = await User.countDocuments();
    
    console.log('📊 DATABASE INFO:');
    console.log('   Database:', stats.db);
    console.log('   Collections:', collections.map(c => c.name));
    console.log('   Total Users:', userCount);
    
    res.json({
      database: stats.db,
      collections: collections.map(c => c.name),
      userCount: userCount,
      connection: {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
      }
    });
  } catch (error) {
    console.error('DB Info error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ===== GUARANTEED PORT MANAGER - NEVER FAILS =====
const net = require('net');
const fs = require('fs');

class GuaranteedPortManager {
  constructor() {
		// Allow overriding the default port via environment so test runners
		// (which set PORT) can control where the server binds.
		this.defaultPort = parseInt(process.env.PORT || '5000', 10);
  }

  async findAvailablePort() {
    if (await this.isPortAvailable(this.defaultPort)) return this.defaultPort;
    
    for (let port = this.defaultPort + 1; port <= this.defaultPort + 10; port++) {
      if (await this.isPortAvailable(port)) {
        console.log(`🔄 Port ${this.defaultPort} busy, using port ${port}`);
        return port;
      }
    }
    
    console.log('🔥 Using OS-assigned random port');
    return 0;
  }

  isPortAvailable(port) {
    return new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port);
    });
  }

  savePortToFile(port) {
    try {
      const portFile = path.join(process.cwd(), 'CURRENT_BACKEND_PORT');
      fs.writeFileSync(portFile, port.toString());
      console.log(`💾 Backend port ${port} saved`);
    } catch (error) {}
  }

  async startServerGuaranteed(app) {
    console.log('🚀 STARTING SERVER WITH GUARANTEED PORT...');
    const port = await this.findAvailablePort();
    this.savePortToFile(port);
    
    return new Promise((resolve) => {
      const server = app.listen(port, '0.0.0.0', () => {
        const actualPort = server.address().port;
        console.log(`🎉 SERVER RUNNING ON PORT ${actualPort}`);
        initSocket(server);
        console.log('Socket.IO initialized');
        resolve(server);
      });
    });
  }
}

// Start server
(async () => {
  try {
    await waitForMongo(10000);
    console.log('MongoDB ready - starting server');
    const portManager = new GuaranteedPortManager();
    await portManager.startServerGuaranteed(app);
    console.log('✅✅✅ SERVER STARTED SUCCESSFULLY');
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();

