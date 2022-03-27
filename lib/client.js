import EventEmitter from 'events'

export class Client extends EventEmitter {
	constructor(manager) {
		super()
		this.manager = manager
		this.state = new ConnectedState(this)
	}

	handleMessage(text) {
		try {
			const message = JSON.parse(text)
			if (this.manager.requestValidator(message)) {
				this.state.handle(message)
			} else {
				throw new Error(this.manager.requestValidator.errors[0].message)
			}
		} catch (error) {
			this.handleEvent({name: 'error', parameters: {message: error.message}})
		}
	}

	handleClose() {
		this.state.handleDisconnect()
	}

	handleEvent(command) {
		this.emit('message', JSON.stringify(command))
	}
}

class StateBase {
	constructor(client) {
		this.client = client
	}

	handle(_message) {
		throw new Error('cannot handle message')
	}

	handleDisconnect() {}
}

class ConnectedState extends StateBase {
	handle(message) {
		if (message.name === 'join') {
			this.handleJoin(message.parameters)
		} else if (message.name === 'rejoin') {
			this.handleRejoin(message.parameters)
		} else if (message.name === 'create') {
			this.handleCreate(message.parameters)
		} else {
			super.handle(message)
		}
	}

	handleJoin({id, name}) {
		this.client.match = this.client.manager.findMatch(id)
		this.client.match.join(this, name, false)
		this.client.completeHandshake()
	}

	handleRejoin({id, secret}) {
		const match = this.client.manager.findMatch(id)
		const player = match.players.find(player => player.secret === secret)
		if (!player) {
			throw new Error('invalid player secret')
		}

		this.client.match = match
		this.client.player = player
		this.client.match.attachClient(this.client)
		this.completeHandshake()
	}

	handleCreate({name}) {
		this.client.match = this.client.manager.createMatch()
		this.client.match.join(this, name, true)
		this.completeHandshake()
	}

	completeHandshake() {
		const player = this.client.player
		const match = this.client.match
		this.client.handleEvent({
			name: 'ok',
			parameters: {
				playerId: player.id,
				playerSecret: player.secret,
				match: {
					id: match.id,
					stage: match.stage.name,
					players: match.players.map(p => ({
						id: p.id,
						name: p.name,
						balance: p.balance,
						bank: p.bank,
						absent: p.clientCount === 0
					})),
					freeParkingBalance: match.freeParkingBalance,
					rules: match.rules,
					history: match.history
				}
			}
		})
		this.client.state = new JoinedState(this.client)
	}
}

class JoinedState extends StateBase {
	handle(message) {
		console.log(message)
		if (message.name === 'leave') {
			this.detachClient()
			this.client.state = new ConnectedState(this.client)
			this.client.handleEvent({
				name: 'left',
				parameters: {}
			})
		} else {
			this.client.match.handle(this.client, message)
		}
	}

	handleDisconnect() {
		this.detachClient()
	}

	detachClient() {
		this.client.match.detachClient(this.client)
		this.client.player = undefined
		this.client.match = undefined
	}
}
