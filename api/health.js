export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'control-de-creditos',
    timestamp: new Date().toISOString(),
  });
}
