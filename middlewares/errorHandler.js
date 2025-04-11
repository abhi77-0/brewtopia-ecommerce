const notFoundHandler = (req, res, next) => {
    res.status(404).render('shop/error', {
        title: '404 - Page Not Found',
        error: 'The page you are looking for does not exist.',
        isAuthenticated: req.isAuthenticated(),
        user: req.user
    });
};

module.exports = {
    notFoundHandler
}; 