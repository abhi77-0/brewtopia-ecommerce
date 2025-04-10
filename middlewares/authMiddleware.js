module.exports = {
    // Existing authentication check
    isAuthenticated: (req, res, next) => {
        // Remove debug logs for production
        // console.log('Session:', req.session);
        // console.log('User:', req.user);
        
        if (req.session.user || req.user) {
            // Ensure user data is consistent between passport and session
            if (req.user && !req.session.user) {
                // Copy passport user to session
                req.session.user = {
                    id: req.user._id || req.user.id,
                    name: req.user.name || req.user.displayName,
                    email: req.user.email || (req.user.emails ? req.user.emails[0].value : ''),
                    picture: req.user.picture || (req.user.photos ? req.user.photos[0].value : ''),
                    googleId: req.user.googleId,
                    isAuthenticated: true
                };
            } else if (req.session.user && !req.user) {
                // Copy session user to passport for consistency
                req.user = req.session.user;
            }
            
            // Ensure user data is available in locals for views
            res.locals.user = req.session.user || req.user;
            res.locals.isAuthenticated = true;
            return next();
        }
        
        // Handle special cases where no redirect is needed (API calls, etc.)
        if (req.xhr || req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Store the original URL for redirect after login
        req.session.returnTo = req.originalUrl;
        res.redirect('/users/login');
    },

    // New middleware to ensure user is always available in views
    setUserLocals: (req, res, next) => {
        // Prioritize Passport user, fallback to session user
        if (req.user || req.session.user) {
            // Ensure consistent user data between passport and session
            if (req.user && !req.session.user) {
                req.session.user = {
                    id: req.user._id || req.user.id,
                    name: req.user.name || req.user.displayName,
                    email: req.user.email || (req.user.emails ? req.user.emails[0].value : ''),
                    picture: req.user.picture || (req.user.photos ? req.user.photos[0].value : ''),
                    googleId: req.user.googleId,
                    isAuthenticated: true
                };
            } else if (req.session.user && !req.user) {
                req.user = req.session.user;
            }
            
            res.locals.user = req.user || req.session.user;
            res.locals.isAuthenticated = true;
        } else {
            res.locals.user = null;
            res.locals.isAuthenticated = false;
        }
        
        // Add convenience methods to check authentication in templates
        res.locals.isLoggedIn = !!res.locals.user;
        
        next();
    },

    isAdmin: (req, res, next) => {
        // Remove debug logs for production
        // console.log('isAdmin middleware:', {
        //     user: req.user,
        //     session: req.session,
        //     isAdmin: req.user?.isAdmin
        // });

        if ((req.user && req.user.isAdmin) || (req.session.user && req.session.user.isAdmin)) {
            next();
        } else {
            // console.log('Admin access denied');
            if (req.xhr || req.headers.accept && req.headers.accept.includes('application/json')) {
                res.status(403).json({
                    success: false,
                    message: 'Admin access required'
                });
            } else {
                res.redirect('/admin/login');
            }
        }
    }
};