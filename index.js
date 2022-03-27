import ws from 'ws'
import jsonfile from 'jsonfile'
import Ajv from 'ajv'
import {Manager} from './lib/manager.js'

async function main() {
	const ajv = new Ajv()

	const requestsSchema = await jsonfile.readFile('./lib/requests.json')

	console.log('loaded json schema')

	const manager = new Manager(ajv.compile(requestsSchema))
	const server = new ws.Server({port: process.env.PORT})
	server.on('connection', socket => manager.handle(socket))

	console.log('listening on port ' + process.env.PORT)
}

main().catch(error => console.error(error))
