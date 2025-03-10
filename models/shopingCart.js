const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    variant: {
        type: String,
        required: true,
        enum: ['500ml', '650ml']
    }
});

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [cartItemSchema],
    
});


module.exports = mongoose.model("Cart", cartSchema);