module.exports = {
    // Existing authentication check
    isAuthenticated: (req, res, next) => {
        // Add console.log for debugging
        console.log('Session:', req.session);
        console.log('User:', req.user);
        
        if (req.session.user || req.user) {
            // Set user in both req.user and req.session.user to ensure consistency
            req.user = req.user || req.session.user;
            req.session.user = req.session.user || req.user;
            
            // Ensure user data is available in locals for views
            res.locals.user = req.session.user || req.user;
            res.locals.isAuthenticated = true;
            return next();
        }
        res.redirect('/users/login');
    },

    // New middleware to ensure user is always available in views
    setUserLocals: (req, res, next) => {
        // Prioritize Passport user, fallback to session user
        res.locals.user = req.user || req.session.user || null;
        res.locals.isAuthenticated = req.isAuthenticated() || (req.session.user !== undefined);
        next();
    },

    isAdmin: (req, res, next) => {
        console.log('isAdmin middleware:', {
            user: req.user,
            session: req.session,
            isAdmin: req.user?.isAdmin
        });

        if (req.user && req.user.isAdmin) {
            next();
        } else {
            console.log('Admin access denied');
            res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
    }
};