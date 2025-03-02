const isAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

const isNotAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        res.redirect('/admin/dashboard');
    } else {
        next();
    }
};

module.exports = {
    isAdmin,
    isNotAdmin
}; 