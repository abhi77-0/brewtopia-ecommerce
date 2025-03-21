const Offer = require('../../models/Offer');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const mongoose = require('mongoose');

// Get all offers and render the main offer page
exports.getOffers = async (req, res) => {
    try {
        // First, get all offers without populating
        const offers = await Offer.find().sort('-createdAt');
        
        // Manually populate the applicableTo field based on type
        for (let offer of offers) {
            if (offer.type === 'product') {
                const product = await Product.findById(offer.applicableTo);
                offer.applicableTo = product;
            } else if (offer.type === 'category' || offer.type === 'Category') {
                try {
                    const category = await mongoose.model('Category').findById(offer.applicableTo);
                    offer.applicableTo = category;
                } catch (err) {
                    console.error('Error populating category:', err);
                    // Continue without populating this field
                }
            }
        }

        // Include both _id and name fields in the select
        const products = await Product.find({ isVisible: true })
            .select('_id name');
        
        const categories = await mongoose.model('Category').find({ isVisible: true })
            .select('_id name');

        console.log('Products:', products); // Debug log
        console.log('Categories:', categories); // Debug log

        res.render('admin/offer', {
            title: 'Manage Offers',
            offers,
            products,
            categories,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching offers:', error);
        req.flash('error', 'Failed to fetch offers');
        res.redirect('/admin/dashboard');
    }
};

// Get single offer for editing
exports.getOffer = async (req, res) => {
    try {
        // First, find the offer without populating
        const offer = await Offer.findById(req.params.id);
        
        if (!offer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Offer not found' 
            });
        }

        // Manually populate the applicableTo field based on type
        if (offer.type === 'product') {
            const product = await Product.findById(offer.applicableTo);
            offer.applicableTo = product;
        } else if (offer.type === 'category' || offer.type === 'Category') {
            try {
                const category = await mongoose.model('Category').findById(offer.applicableTo);
                offer.applicableTo = category;
            } catch (err) {
                console.error('Error populating category:', err);
                // Continue without populating this field
            }
        }

        res.json(offer);
    } catch (error) {
        console.error('Error fetching offer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch offer details' 
        });
    }
};

// Add new offer
exports.postAddOffer = async (req, res) => {
    try {
        const {
            name,
            description,
            type,
            startDate,
            discountPercentage,
            endDate,
            applicableToId,
        } = req.body;

        const now = new Date();
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);

        // Validate start date is not in the past
        if (startDateObj < now) {
            return res.status(400).json({
                success: false,
                message: 'Start date cannot be in the past'
            });
        }

        // Validate end date is after start date
        if (startDateObj >= endDateObj) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Check for existing offers
        const existingOffer = await Offer.findOne({
            type,
            applicableTo: applicableToId,
            endDate: { $gte: now },
            isActive: true
        });

        if (existingOffer) {
            return res.status(400).json({
                success: false,
                message: `An active offer already exists for this ${type}`
            });
        }

        // Create new offer
        const offer = new Offer({
            name,
            description,
            type,
            discountPercentage,
            applicableTo: applicableToId,
            startDate,
            endDate,
            isActive: true
        });

        await offer.save();

        // Update product/category references
        if (type === 'product') {
            await Product.findByIdAndUpdate(applicableToId, {
                $set: { offer: offer._id }
            });
        } else if (type === 'category') {
            await Product.updateMany(
                { category: applicableToId },
                { $set: { categoryOffer: offer._id } }
            );
        }

        res.json({
            success: true,
            message: 'Offer created successfully',
            offer
        });
    } catch (error) {
        console.error('Error creating offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create offer'
        });
    }
};

// Update existing offer
exports.postEditOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const {
            name,
            description,
            type,
            discountPercentage,
            startDate,
            endDate,
            applicableToId,
            isActive
        } = req.body;

        const now = new Date();
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);

        // Validate start date is not in the past
        if (startDateObj < now) {
            return res.status(400).json({
                success: false,
                message: 'Start date cannot be in the past'
            });
        }

        // Validate end date is after start date
        if (startDateObj >= endDateObj) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        // Check for existing offers (excluding this one)
        if (type && applicableToId && (type !== offer.type || applicableToId !== offer.applicableTo.toString())) {
            const existingOffer = await Offer.findOne({
                _id: { $ne: offerId },
                type,
                applicableTo: applicableToId,
                endDate: { $gte: now },
                isActive: true
            });

            if (existingOffer) {
                return res.status(400).json({
                    success: false,
                    message: `An active offer already exists for this ${type}`
                });
            }
        }

        // Update offer fields
        offer.name = name;
        offer.description = description;
        if (type) offer.type = type;
        offer.discountPercentage = discountPercentage;
        if (applicableToId) offer.applicableTo = applicableToId;
        offer.startDate = startDate;
        offer.endDate = endDate;
        offer.isActive = isActive === 'true' || isActive === true;

        await offer.save();

        // Update product/category references
        await updateProductReferences(offer);

        res.json({
            success: true,
            message: 'Offer updated successfully',
            offer
        });
    } catch (error) {
        console.error('Error updating offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update offer: ' + error.message
        });
    }
};

// Helper function to update product references
async function updateProductReferences(offer) {
    if (offer.type === 'product') {
        if (offer.isActive) {
            await Product.findByIdAndUpdate(offer.applicableTo, {
                $set: { offer: offer._id }
            });
        } else {
            await Product.findByIdAndUpdate(offer.applicableTo, {
                $unset: { offer: 1 }
            });
        }
    } else if (offer.type === 'category') {
        if (offer.isActive) {
            await Product.updateMany(
                { category: offer.applicableTo },
                { $set: { categoryOffer: offer._id } }
            );
        } else {
            await Product.updateMany(
                { category: offer.applicableTo },
                { $unset: { categoryOffer: 1 } }
            );
        }
    }
}

// ... existing code ...

// Delete offer
exports.deleteOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        // Remove offer references from products before deleting
        if (offer.type === 'product') {
            await Product.findByIdAndUpdate(offer.applicableTo, {
                $unset: { offer: 1 }
            });
        } else if (offer.type === 'category') {
            await Product.updateMany(
                { category: offer.applicableTo },
                { $unset: { categoryOffer: 1 } }
            );
        }

        // Delete the offer
        await offer.deleteOne();

        res.json({
            success: true,
            message: 'Offer deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete offer',
            error: error.message
        });
    }
};

// ... rest of your existing code ...

// Keep the existing deleteOffer and calculateBestOffer functions as they are 