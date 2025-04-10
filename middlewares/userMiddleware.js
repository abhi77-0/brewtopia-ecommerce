const User = require('../models/userModel');

module.exports = async (req, res, next) => {
    try {
        // Safely check authentication from multiple sources
        const isAuth = req.isAuthenticated ? req.isAuthenticated() : !!(req.session && req.session.user);
        
        // Get user from either passport or session
        const user = req.user || (req.session && req.session.user) || null;
        
        // Ensure consistent user data between passport and session
        if (req.user && req.session && !req.session.user) {
            req.session.user = {
                id: req.user._id || req.user.id,
                name: req.user.name || req.user.displayName,
                email: req.user.email || (req.user.emails && req.user.emails[0] ? req.user.emails[0].value : ''),
                picture: req.user.picture || (req.user.photos && req.user.photos[0] ? req.user.photos[0].value : ''),
                googleId: req.user.googleId,
                isAuthenticated: true
            };
        } else if (req.session && req.session.user && !req.user) {
            req.user = req.session.user;
        }
        
        // Set user and authentication status in locals for views
        res.locals.user = user;
        res.locals.isAuthenticated = isAuth;
        res.locals.isLoggedIn = !!user;
        
        // If user is authenticated, check if they're blocked
        if (user) {
            // Get user ID
            const userId = user.id || user._id;
            if (userId) {
                // Try to fetch latest user data from database to check blocked status
                try {
                    const latestUserData = await User.findById(userId);
                    if (latestUserData && latestUserData.blocked) {
                        handleBlockedUser(req, res);
                        return; // Stop processing
                    }
                } catch (dbError) {
                    console.error('Error fetching user data:', dbError);
                    // Continue with session data if DB lookup fails
                }
                
                const userIdStr = userId.toString();
                
                // Check if user has the isBlocked flag (from Google auth)
                if (user.isBlocked || user.blocked) {
                    handleBlockedUser(req, res);
                    return; // Stop processing
                }
                
                // Check global blockedUsers array
                if (global.blockedUsers && global.blockedUsers.includes(userIdStr)) {
                    handleBlockedUser(req, res);
                    return; // Stop processing
                }
            }
        }
        
        // Continue to next middleware
        next();
    } catch (error) {
        console.error('Error in user middleware:', error);
        next(); // Continue even if there's an error
    }
};

// Helper function to handle blocked users
function handleBlockedUser(req, res) {
    // For Passport (Google auth)
    if (req.logout) {
        req.logout(function(err) {
            if (err) { 
                console.error('Error during logout:', err);
            }
        });
    }
    
    // Clear session data
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            
            // For API requests, return JSON response
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                res.status(403).json({
                    success: false,
                    error: 'Your account has been blocked. Please contact support.'
                });
            } else {
                // For web requests, redirect to signup with error
                res.redirect('/users/signup?error=Your+account+has+been+blocked+by+an+administrator.+Please+contact+support.');
            }
        });
    }
}