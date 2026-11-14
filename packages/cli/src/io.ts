export type IO = {
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout: { write(chunk: string): void };
	stderr: { write(chunk: string): void };
};

export function defaultIo(): IO {
	return {
		cwd: process.cwd(),
		env: process.env,
		stdout: process.stdout,
		stderr: process.stderr,
	};
}
