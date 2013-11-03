

	var   Class 		= require( "ee-class" )
		, log 			= require( "ee-log" )
		, net 			= require( "ee-net" )
		, type 			= require( "ee-types" )
		, crypto 		= require( "crypto" )
		, Waiter 		= require( "ee-waiter" )
		, Events 		= require( "ee-event-emitter" )
		, machineId 	= require( "ee-machine-id" )
		, project 		= require( "ee-project" );



	var Peers 			= require( "./Peers" );


	module.exports = new Class( {
		inherits: Events

		, revision: 0


		, init: function( options ){
			this.config = options.config || require( project.root + "/config.ha.js" );

			if ( !this.config ) throw new Error( "missing Quroum HA config!" ).setName( "InvalidConfigException" );
			if ( !this.config.peers ) this.config.peers = [];

			if ( !this.config.server ) throw new Error( "missing Quroum HA config parameter «server»!" ).setName( "InvalidConfigException" );
			if ( !type.number( this.config.server.port ) ) throw new Error( "Quroum HA config «port» i snot typeof number!" ).setName( "InvalidConfigException" );

			this.quorum = Math.floor( ( this.config.peers.length + 1 ) / 2 + 1 );
			log.info( "the quorum is "+this.quorum+", configured peers: "+this.config.peers.length );


			machineId.get( function( id ){
				this.id = crypto.createHash( "sha1" ).update( id + Math.random() + process.pid + Date.now() ).digest( "hex" );
				log.debug( "my quorum id is «"+this.id+"», my current revision is " + this.revision );

				this.peers = new Peers( {
					  id: 		this.id
					, config: 	this.config
				} );
			}.bind( this ) );	
		}



	} );