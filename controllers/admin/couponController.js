const Coupon = require('../../models/Coupon');

exports.getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.render('admin/coupons/index', {
            title: 'Manage Coupons',
            coupons,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        req.flash('error', 'Failed to fetch coupons');
        res.redirect('/admin/dashboard');
    }
};

exports.createCoupon = async (req, res) => {
    try {
        const {
            code,
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maxDiscount,
            startDate,
            endDate,
            usageLimit
        } = req.body;

        await Coupon.create({
            code: code.toUpperCase(),
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maxDiscount: maxDiscount || null,
            startDate,
            endDate,
            usageLimit: usageLimit || null,
            isActive: true
        });

        req.flash('success', 'Coupon created successfully');
        res.redirect('/admin/coupons');
    } catch (error) {
        console.error('Error creating coupon:', error);
        req.flash('error', 'Failed to create coupon');
        res.redirect('/admin/coupons');
    }
};

exports.toggleCouponStatus = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update coupon status'
        });
    }
}; 