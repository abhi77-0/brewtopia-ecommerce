const User = require('../models/userModel');

module.exports = async (req, res, next) => {
    try {
        // Safely check authentication
        const isAuth = req.isAuthenticated ? req.isAuthenticated() : !!(req.session && req.session.user);
        
        // Set user and authentication status
        const user = req.user || (req.session && req.session.user) || null;
        res.locals.user = user;
        res.locals.isAuthenticated = isAuth;
        
        // If user is authenticated, check if they're blocked
        if (user) {
            // Get user ID
            const userId = user.id || user._id;
            if (userId) {
                const userIdStr = userId.toString();
                
                // Check if user has the isBlocked flag (from Google auth)
                if (user.isBlocked) {
                    // For Passport (Google auth)
                    if (req.logout) {
                        req.logout(function(err) {
                            if (err) { 
                                console.error('Error during logout:', err);
                            }
                        });
                    }
                    
                    // Destroy session
                    req.session.destroy((err) => {
                        if (err) {
                            console.error('Error destroying session:', err);
                        }
                        return res.redirect('/users/signup?error=Your+account+has+been+blocked+by+an+administrator.+Please+contact+support.');
                    });
                    return;
                }
                
                // Check global blockedUsers array
                if (global.blockedUsers && global.blockedUsers.includes(userIdStr)) {
                    // For Passport (Google auth)
                    if (req.logout) {
                        req.logout(function(err) {
                            if (err) { 
                                console.error('Error during logout:', err);
                            }
                        });
                    }
                    
                    // Destroy session
                    req.session.destroy((err) => {
                        if (err) {
                            console.error('Error destroying session:', err);
                        }
                        return res.redirect('/users/signup?error=Your+account+has+been+blocked+by+an+administrator.+Please+contact+support.');
                    });
                    return;
                }
                
                // Double-check with database
                try {
                    const dbUser = await User.findById(userIdStr);
                    if (dbUser && dbUser.blocked) {
                        // Add to global blockedUsers if not already there
                        if (!global.blockedUsers) {
                            global.blockedUsers = [];
                        }
                        if (!global.blockedUsers.includes(userIdStr)) {
                            global.blockedUsers.push(userIdStr);
                        }
                        
                        // For Passport (Google auth)
                        if (req.logout) {
                            req.logout(function(err) {
                                if (err) { 
                                    console.error('Error during logout:', err);
                                }
                            });
                        }
                        
                        // Destroy session
                        req.session.destroy((err) => {
                            if (err) {
                                console.error('Error destroying session:', err);
                            }
                            return res.redirect('/users/signup?error=Your+account+has+been+blocked+by+an+administrator.+Please+contact+support.');
                        });
                        return;
                    }
                } catch (error) {
                    console.error("Error checking user in database:", error);
                }
            }
        }
        
        next();
    } catch (error) {
        console.error("Error in user middleware:", error);
        next();
    }
};