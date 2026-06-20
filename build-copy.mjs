import { src, dest } from 'gulp';
import merge from 'merge-stream';

export function copySql() {
  const files = src('src/database/*.sql');

  return merge(
    files.pipe(dest('tmp/dist/src/database/')),
    files.pipe(dest('dist/src/database/')),
    files.pipe(dest('dist/database/'))
  );
}
