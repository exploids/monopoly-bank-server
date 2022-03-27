import EventEmitter from 'events'
import {randomId} from './core.js'

const defaultRules = {
	initialBalance: 1500,
	luckyFreeParking: false
}

const bankId = -1
const freeParkingId = -2

export class Match extends EventEmitter {
	/**
     * Creates a match.
     * @param {string} id the match id
     */
	constructor(id) {
		super()
		this.id = id
		this.stage = new PreparingStage(this)
		this.players = []
		this.freeParkingBalance = 0
		this.rules = defaultRules

		this.history = []

		this.clients = new Set()
	}

	join(client, name, bank) {
		client.player = new Player(this.players.length, name)
		client.player.bank = bank
		client.player.clientCount = 1
		this.players.push(client.player)

		this.broadcast('join', {
			name,
			id: client.player.id,
			balance: client.player.balance,
			bank: client.bank,
			absent: false
		})

		this.clients.add(client)
	}

	attachClient(client) {
		if (client.player.clientCount === 0) {
			this.broadcast('absent', {
				id: client.player.id,
				value: false
			})
		}

		client.player.clientCount += 1
		this.clients.add(client)
	}

	detachClient(client) {
		this.clients.delete(client)
		client.player.clientCount -= 1
		if (client.player.clientCount === 0) {
			this.broadcast('absent', {
				id: client.player.id,
				value: true
			})
		}
	}

	handle(client, command) {
		this.stage.handle(client, command)
	}

	findPlayer(id) {
		const player = this.players[id]
		if (!player) {
			throw new Error(`player ${id} not found`)
		}

		return player
	}

	broadcast(name, parameters) {
		const command = {name, parameters}
		for (const client of this.clients) {
			client.handleEvent(command)
		}
	}

	assertStage(stage) {
		if (this.stage !== stage) {
			throw new Error('wrong stage')
		}
	}

	close() {
		this.emit('close')
	}
}

const MATCH_SYMBOL = Symbol('match')
const NAME_SYMBOL = Symbol('name')

class StageBase {
	/**
	 * Creates a new instance of this stage.
	 * @param {Match} match the match
	 * @param {string} name the name of this stage
	 */
	constructor(match, name) {
		this[MATCH_SYMBOL] = match
		this[NAME_SYMBOL] = name
	}

	get match() {
		return this[MATCH_SYMBOL]
	}

	get name() {
		return this[NAME_SYMBOL]
	}

	handle(client, command) {
		const parameterString = JSON.stringify(command.parameters)
		throw new Error(`operation ${command.name} with ${parameterString} is not supported in the current stage`)
	}

	/**
	 * Handles the attachment of a client.
	 * @param {Client} client the client
	 */
	handleAttach() {}

	/**
	 * Handles the detachment of a client.
	 * @param {Client} client the client
	 */
	handleDetach() {
		if (this.match.clients.size === 0) {
			this.match.close()
		}
	}
}

class PreparingStage extends StageBase {
	constructor(match) {
		super(match, 'preparing')
	}

	handle(client, command) {
		if (command.name === 'begin') {
			this.match.stage = new PlayingStage(this.match)
			this.match.broadcast('begin', {})
			this.match.players.forEach(player => {
				player.balance = this.rules.initialBalance
			})
		} else {
			super.handle(client, command)
		}
	}
}

class PlayingStage extends StageBase {
	constructor(match) {
		super(match, 'playing')
		this.timeoutToClose = undefined
	}

	handle(client, command) {
		if (command.name === 'pay') {
			this.handlePay(client, command.parameters)
		} else if (command.name === 'take') {
			const {amount} = command.parameters
			client.player.balance += amount
			this.submitPayment(bankId, client.player.id, amount)
		} else if (command.name === 'takeFreeParking') {
			const amount = this.freeParkingBalance
			if (amount > 0) {
				client.player.balance += amount
				this.freeParkingBalance = 0
				this.submitPayment(freeParkingId, client.player.id, amount)
			}
		} else {
			super.handle(client, command)
		}
	}

	handleAttach(_client) {
		clearTimeout(this.timeoutToClose)
	}

	handleDetach() {
		if (this.match.clients.size === 0) {
			this.timeoutToClose = setTimeout(() => this.match.close(), 5 * 1000)
		}
	}

	handlePay(client, {to, amount}) {
		if (client.player.id === to) {
			throw new Error('you cannot pay yourself')
		}

		if (client.player.balance <= 0) {
			throw new Error('you are broke')
		}

		const actualAmount = Math.min(client.player.balance, amount)

		if (to === freeParkingId) {
			this.freeParkingBalance += actualAmount
		} else if (to !== bankId) {
			const toPlayer = this.findPlayer(toPlayer)
			toPlayer.balance += actualAmount
		}

		client.player.balance -= actualAmount
		this.submitPayment(client.player.id, to, actualAmount)
	}

	submitPayment(from, to, amount) {
		const payment = {from, to, amount}
		this.history.push(payment)
		this.broadcast('pay', payment)

		const numberOfPlayersNotBroke = this.match.players.filter(player => player.balance > 0).length
		if (numberOfPlayersNotBroke <= 1) {
			this.match.stage = new EndStage(this.match)
		}
	}
}

class EndStage extends StageBase {
	constructor(match) {
		super(match, 'end')
	}
}

export class Player {
	constructor(id, name) {
		this.id = id
		this.name = name
		this.balance = 0
		this.bank = false
		this.secret = randomId()
		this.clientCount = 0
	}
}
