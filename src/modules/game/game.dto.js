function formatLobbyPlayerDTO(player) {
  if (!player) return null;
  return {
    id: player.id || player.userId,
    displayName: player.displayName || player.name || player.username || 'Player',
    avatar: player.avatar || null,
    seat: player.seat !== undefined ? player.seat : 0,
    team: player.team !== undefined ? player.team : 1,
    lobbyRole: player.lobbyRole || (player.isHost ? "HOST" : "PLAYER"),
    status: player.status || "CONNECTED",
    isReady: Boolean(player.isReady),
    isBot: Boolean(player.isBot),
    rating: player.rating,
    level: player.level,
    badge: player.badge
  };
}

function formatLobbyDTO(lobby, players = []) {
  if (!lobby) return null;
  return {
    id: lobby.id,
    gameId: lobby.game_id,
    hostUserId: lobby.host_user_id,
    settings: {
      mode: lobby.settings?.mode || (lobby.visibility === 'PRIVATE' ? 'CUSTOM' : 'AUTO'),
      visibility: lobby.visibility || 'PUBLIC',
      teamsLocked: lobby.settings?.teamsLocked || false,
      autoBalance: lobby.settings?.autoBalance !== undefined ? lobby.settings.autoBalance : true,
      targetPlayers: lobby.settings?.targetPlayers || lobby.max_players,
      minPlayers: lobby.settings?.minPlayers || 2,
      inviteCode: lobby.invite_code || null,
      pendingInvites: lobby.settings?.pendingInvites || [],
    },
    state: {
      status: lobby.status,
      expiresAt: lobby.expires_at,
      currentPlayers: lobby.current_players,
      startedAt: lobby.started_at
    },
    players: players.map(formatLobbyPlayerDTO)
  };
}

module.exports = {
  formatLobbyDTO,
  formatLobbyPlayerDTO
};
