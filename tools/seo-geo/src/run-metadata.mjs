export async function readRunMetadata(read, isActive) {
  let meta = await read();
  if (meta?.status === 'running' && !isActive()) {
    // The first read may have opened the old file before the job committed its
    // final status and cleared the active job. Confirm with a fresh read.
    meta = await read();
    if (meta?.status === 'running' && !isActive()) {
      return {...meta, status: 'interrupted', message: '上次运行已中断，可查看已保存数据。'};
    }
  }
  return meta;
}
