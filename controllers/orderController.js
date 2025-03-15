// // When creating a new order
// const total = cart.items.reduce((sum, item) => {
//     return sum + (item.price * item.quantity);
// }, 0);

// const order = new Order({
//     user: userId,
//     items: cart.items,
//     total: total || 0, // Ensure there's always a total value
//     status: 'pending'
// }); 