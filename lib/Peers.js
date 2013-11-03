

	var   Class 		= require( "ee-class" )
		, log 			= require( "ee-log" )
		, net 			= require( "ee-net" )
		, type 			= require( "ee-types" )
		, Waiter 		= require( "ee-waiter" )
		, Events 		= require( "ee-event-emitter" );




	// manages peer connection but not the quorum itself

	module.exports = new Class( {
		inherits: Events


		, handshakeTimeout: 2000
		, reconnectTimeout: 10000

		, peers: {}


		, init: function( options ){
			this.config = options.config;
			this.id 	= options.id;

			this.initializePeers( this.startServer.bind( this ) );
		}



		, addConnection: function( connection ){
			if ( this.peers[ connection.id ] ){
				// the connection exists already
				connection.end();
			}
			this.peers[ connection.id ] = connection;
		}


		//try to reconnect to my peers all the time
		, handleDeadPeer: function( config ){
			setTimeout( function(){
				this.connect( config, function( err, connection ){
					if ( !err && connection ){
						this.emit( "connect", [ connection.id ] );
					}
				}.bind( this ) );
			}.bind( this ), this.reconnectTimeout );
		}



		, handlePeerConnectionClose: function( connection, err ){
			if ( this.peers[ connection.id ] ){
				delete this.peers[ connection.id ];

				// add to dead peers, we should try to reconnect! but only if we were the initiatingn peer
				if ( connection.config ) this.handleDeadPeer( connection.config );

				this.emit( "disconnect", connection.id );
			}
			else throw new Error( "Attempt to close an unregistered connection!" ).setName( "InvalidCloseException" )
		}



		, handleMessage: function( connection, message ){
			log( message );
		}



		, connect: function( config, callback ){
			var connection = new net.Connection( config ), handshakeTimeout;

			var connectionCloseHandler = function( err ){
				if ( handshakeTimeout ){
					// clear the handshake timeout
					clearTimeout( handshakeTimeout );
					handshakeTimeout = null;
				}

				// try to receonnect late
				this.handleDeadPeer( config );

				log.debug( "failed to connect to peer «"+config.host+":"+config.port+"» ..." );
				callback( new Error().setName( "ConnectionException" ) );
			}.bind( this )

			connection.on( "close", connectionCloseHandler );
			connection.on( "error", function(){} );

			connection.on( "connect", function(){

				// abort initialization after a short amount of time
				handshakeTimeout = setTimeout( function(){
					connection.off( "message", handleMessage );
					handshakeTimeout = null;

					log.warn( "Handshake timeout was encountered for peer «"+config.host+":"+config.port+"» ..." );
					connection.end();
				}.bind( this ), this.handshakeTimeout );

				var handleMessage = function( message ){log( message );
					// remove message handler
					connection.off( "message", handleMessage );

					// handshale was not timed out
					if ( handshakeTimeout ) {
						clearTimeout( handshakeTimeout );
						handshakeTimeout = null;
					}

					if ( message.action === "peerHello" ){
						if ( message.body && message.body.id ){

							// respond
							connection.send( { action: "peerAck", body: { id: this.id } } );

							// ok
							connection.id = message.id;

							// add defualt close handler
							connection.off( "close", connectionCloseHandler );
							connection.on( "close", function( err ){ this.handlePeerConnectionClose( connection, err ) }.bind( this ) );

							// add message handler
							connection.on( "message", function( message ){ this.handleMessage( connection, message ) }.bind( this )  );

							connection.config = config;

							// add to available connections
							this.addConnection( connection );

							callback( null, connection );
						}
						else {
							throw new Error( "missing message body or id field in message body!" ).setName( "InvalidHandshakeException" );
							connection.end();	
						}
					}
					else {
						throw new Error( "invalid handshake from peer!" ).setName( "InvalidHandshakeException" );
						connection.end();
					}
				}.bind( this );

				connection.on( "message", handleMessage );
			}.bind( this ) );
		}



		// this is called only at startup, it tries to connect to all 
		// peers without emitting a shitload of events
		, initializePeers: function( callback ){
			var connectionWaiter = new Waiter( function(){
				this.emit( "connect", Object.keys( this.peers ) );
				callback();
			}.bind( this ) );

			// connect to all hosts
			this.config.peers.forEach( function( peerConfig ){
				connectionWaiter.add( function( cb ){
					this.connect( peerConfig, cb );
				}.bind( this ) );				
			}.bind( this ) );

			connectionWaiter.start();
		}



		// conenction for another peer
		, handleConnection: function( connection ){

			var handshakeTimeout
				, messageHandler = function( message ){ log( message );
				connection.off( "message", messageHandler );
				if ( handshakeTimeout ) {
					clearTimeout( handshakeTimeout );
					handshakeTimeout = null;
				}


				if ( message && message.action === "peerAck" ){
					if ( message.body && message.body.id ){
						connection.id = message.body.id;

						connection.on( "close", function( err ){ this.handlePeerConnectionClose( connection, err ) }.bind( this ) );
						connection.on( "message", function( message ){ this.handleMessage( connection, message ) }.bind( this )  );

						this.addConnection( connection );
						this.emit( "connect", [ connection.id ] );
					}
					else {
						throw new Error( "missing message body or id field in message body!" ).setName( "InvalidHandshakeException" );
						connection.close();
					}
				}
				else {
					throw new Error( "invalid handshake from peer!" ).setName( "InvalidHandshakeException" );
					connection.close();
				}
			}.bind( this );


			handshakeTimeout = setTimeout( function(){
				connection.off( "message", messageHandler );
				handshakeTimeout = null;

				log.warn( "Handshake timeout was encountered for a connecting peer ..." );
				connection.end();
			}.bind( this ), this.handshakeTimeout );


			connection.on( "message", messageHandler );
			connection.send( { action: "peerHello", body: { id: this.id } } );
		}


		, handleServerError: function( err ){
			log.error( "the quorum server failed!" );
			log.trace( err );
			this.emit( "error", err );
		}




		// start the server which accepts incoming connections
		, startServer: function(){
			this.server = new net.Server( this.config.server );

			this.server.on( "error", this.handleServerError.bind( this ) );
			this.server.on( "connection", this.handleConnection.bind( this ) );

			this.server.on( "listening", function(){
				log.debug( "The quorum server is listeing on «"+this.config.server.host+":"+this.config.server.port+"» ..." );
			}.bind( this ) );

			this.server.listen();
		}
	} );