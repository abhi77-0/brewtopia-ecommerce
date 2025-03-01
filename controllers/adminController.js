require('dotenv').config();

// Admin login controller
const adminLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('Login attempt for:', email);

        // Check credentials against environment variables
        if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
            console.log('Invalid credentials');
            return res.redirect('/admin/login?error=Invalid email or password');
        }

        // Set admin session
        req.session.user = {
            email: process.env.ADMIN_EMAIL,
            name: process.env.ADMIN_NAME,
            role: 'admin',
            isAdmin: true
        };

        console.log('Admin login successful:', email);
        return res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Admin login error:', error);
        return res.redirect('/admin/login?error=Login failed. Please try again.');
    }
};

// Admin logout
const adminLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/admin/login');
    });
};

// Get admin dashboard stats
const getDashboardStats = async () => {
    try {
        return {
            totalProducts: 0,
            newOrders: 0,
            totalUsers: 0,
            totalRevenue: 0
        };
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return null;
    }
};

module.exports = {
    adminLogin,
    adminLogout,
    getDashboardStats
}; 