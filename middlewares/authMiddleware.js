module.exports = {
    // Existing authentication check
    isAuthenticated: (req, res, next) => {
        if (req.isAuthenticated() || req.session.user) {
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
    }
};