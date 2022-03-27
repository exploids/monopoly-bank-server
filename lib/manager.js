import {randomId} from './core.js'
import {Match} from './match.js'
import {Client} from './client.js'

export class Manager {
	constructor(requestValidator) {
		this.matches = new Map()
		this.requestValidator = requestValidator
	}

	handle(socket) {
		const client = new Client(this)
		client.on('message', message => socket.send(message))
		socket.on('message', message => client.handleMessage(message))
		socket.on('close', () => client.handleClose())
	}

	createMatch() {
		const match = new Match(this, randomId())
		match.on('close', () => this.closeMatch(match.id))
		this.matches.set(match.id, match)
		console.log(`created new match ${match.id}`)
		return match
	}

	findMatch(id) {
		const match = this.matches.get(id)
		if (!match) {
			throw new Error(`match "${id}" not found`)
		}

		return match
	}

	closeMatch(id) {
		console.log(`closing match ${id}`)
		if (!this.matches.delete(id)) {
			throw new Error(`match "${id}" not found`)
		}
	}
}
