import {randomBytes} from 'crypto'

export function randomId(bytes = 9) {
	return randomBytes(bytes).toString('base64')
		.replace('+', '-').replace('/', '_')
}
