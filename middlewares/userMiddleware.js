module.exports = (req, res, next) => {
    // Safely check authentication
    const isAuth = req.isAuthenticated ? req.isAuthenticated() : !!(req.session && req.session.user);
    
    // Set user and authentication status
    res.locals.user = req.user || (req.session && req.session.user) || null;
    res.locals.isAuthenticated = isAuth;
    
    next();
}