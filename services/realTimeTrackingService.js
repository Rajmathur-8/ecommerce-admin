import { Server } from 'socket.io';

class RealTimeTrackingService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  // Initialize Socket.IO server
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.io.on('connection', (socket) => {
      console.log('📱 Client connected for real-time tracking:', socket.id);
      
      // Handle tracking subscription
      socket.on('subscribe_tracking', (data) => {
        const { trackingNumber, userId } = data;
        console.log(`📦 User ${userId} subscribed to tracking: ${trackingNumber}`);
        
        // Join tracking room
        socket.join(`tracking_${trackingNumber}`);
        
        // Store client info
        this.connectedClients.set(socket.id, {
          trackingNumber,
          userId,
          socket
        });
      });

      // Handle tracking unsubscription
      socket.on('unsubscribe_tracking', (data) => {
        const { trackingNumber } = data;
        console.log(`📦 Client unsubscribed from tracking: ${trackingNumber}`);
        
        socket.leave(`tracking_${trackingNumber}`);
        this.connectedClients.delete(socket.id);
      });

      // Handle delivery boy location updates
      socket.on('delivery_location_update', (data) => {
        const { trackingNumber, location, deliveryBoyId } = data;
        console.log(`🚚 Delivery boy location update for ${trackingNumber}:`, location);
        
        // Broadcast location update to subscribed clients
        this.io.to(`tracking_${trackingNumber}`).emit('location_update', {
          trackingNumber,
          location,
          deliveryBoyId,
          timestamp: new Date()
        });
      });

      // Handle delivery boy status updates
      socket.on('delivery_status_update', (data) => {
        const { trackingNumber, status, description, deliveryBoyId } = data;
        console.log(`📋 Delivery status update for ${trackingNumber}: ${status}`);
        
        // Broadcast status update to subscribed clients
        this.io.to(`tracking_${trackingNumber}`).emit('status_update', {
          trackingNumber,
          status,
          description,
          deliveryBoyId,
          timestamp: new Date()
        });
      });

      // Handle client disconnect
      socket.on('disconnect', () => {
        console.log('📱 Client disconnected:', socket.id);
        this.connectedClients.delete(socket.id);
      });
    });

    console.log('🚀 Real-time tracking service initialized');
  }

  // Broadcast status update to all clients tracking a specific shipment
  async broadcastStatusUpdate(trackingNumber, status, description, additionalData = {}) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot broadcast status update');
      return;
    }

    try {
      const updateData = {
        trackingNumber,
        status,
        description,
        timestamp: new Date(),
        ...additionalData
      };

      console.log(`📡 Broadcasting status update for ${trackingNumber}:`, updateData);
      
      // Send to all clients in the tracking room
      this.io.to(`tracking_${trackingNumber}`).emit('tracking_update', updateData);
      
      // Also send to admin dashboard if needed
      this.io.to('admin_dashboard').emit('delivery_update', updateData);
      
    } catch (error) {
    }
  }

  // Broadcast location update to tracking clients
  async broadcastLocationUpdate(trackingNumber, location, deliveryBoyId) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot broadcast location update');
      return;
    }

    try {
      const locationData = {
        trackingNumber,
        location,
        deliveryBoyId,
        timestamp: new Date()
      };

      console.log(`📍 Broadcasting location update for ${trackingNumber}:`, locationData);
      
      this.io.to(`tracking_${trackingNumber}`).emit('location_update', locationData);
      
    } catch (error) {
    }
  }

  // Send notification to specific user
  async sendNotificationToUser(userId, notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot send notification');
      return;
    }

    try {
      // Find all connected clients for this user
      const userClients = Array.from(this.connectedClients.values())
        .filter(client => client.userId === userId);

      userClients.forEach(client => {
        client.socket.emit('notification', {
          ...notification,
          timestamp: new Date()
        });
      });

      console.log(`📢 Notification sent to user ${userId}:`, notification);
      
    } catch (error) {
    }
  }

  // Get connected clients count
  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  // Get clients tracking a specific shipment
  getTrackingClients(trackingNumber) {
    return Array.from(this.connectedClients.values())
      .filter(client => client.trackingNumber === trackingNumber);
  }

  // Broadcast delivery boy assignment
  async broadcastDeliveryBoyAssignment(trackingNumber, deliveryBoyDetails) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot broadcast delivery boy assignment');
      return;
    }

    try {
      const assignmentData = {
        trackingNumber,
        deliveryBoy: deliveryBoyDetails,
        timestamp: new Date()
      };

      console.log(`👨‍💼 Broadcasting delivery boy assignment for ${trackingNumber}:`, assignmentData);
      
      this.io.to(`tracking_${trackingNumber}`).emit('delivery_boy_assigned', assignmentData);
      
    } catch (error) {
    }
  }

  // Broadcast delivery proof
  async broadcastDeliveryProof(trackingNumber, deliveryProof) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot broadcast delivery proof');
      return;
    }

    try {
      const proofData = {
        trackingNumber,
        deliveryProof,
        timestamp: new Date()
      };

      console.log(`📸 Broadcasting delivery proof for ${trackingNumber}:`, proofData);
      
      this.io.to(`tracking_${trackingNumber}`).emit('delivery_proof', proofData);
      
    } catch (error) {
    }
  }

  // Broadcast estimated delivery time update
  async broadcastEstimatedDeliveryUpdate(trackingNumber, estimatedDelivery) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot broadcast estimated delivery update');
      return;
    }

    try {
      const deliveryData = {
        trackingNumber,
        estimatedDelivery,
        timestamp: new Date()
      };

      console.log(`⏰ Broadcasting estimated delivery update for ${trackingNumber}:`, deliveryData);
      
      this.io.to(`tracking_${trackingNumber}`).emit('estimated_delivery_update', deliveryData);
      
    } catch (error) {
    }
  }

  // Broadcast system-wide announcements
  async broadcastAnnouncement(announcement) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO not initialized, cannot broadcast announcement');
      return;
    }

    try {
      const announcementData = {
        ...announcement,
        timestamp: new Date()
      };

      console.log('📢 Broadcasting system announcement:', announcementData);
      
      this.io.emit('system_announcement', announcementData);
      
    } catch (error) {
    }
  }

  // Get real-time statistics
  getRealTimeStats() {
    const stats = {
      connectedClients: this.connectedClients.size,
      trackingRooms: new Set(
        Array.from(this.connectedClients.values())
          .map(client => client.trackingNumber)
      ).size,
      activeDeliveries: this.getActiveDeliveriesCount()
    };

    return stats;
  }

  // Get count of active deliveries being tracked
  getActiveDeliveriesCount() {
    const activeStatuses = ['pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery'];
    const activeDeliveries = new Set();

    this.connectedClients.forEach(client => {
      if (activeStatuses.includes(client.status)) {
        activeDeliveries.add(client.trackingNumber);
      }
    });

    return activeDeliveries.size;
  }

  // Cleanup disconnected clients
  cleanupDisconnectedClients() {
    const disconnectedClients = [];
    
    this.connectedClients.forEach((client, socketId) => {
      if (!client.socket.connected) {
        disconnectedClients.push(socketId);
      }
    });

    disconnectedClients.forEach(socketId => {
      this.connectedClients.delete(socketId);
    });

    if (disconnectedClients.length > 0) {
      console.log(`🧹 Cleaned up ${disconnectedClients.length} disconnected clients`);
    }
  }
}

export default new RealTimeTrackingService();
