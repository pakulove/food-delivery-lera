let notificationShown = false;

function showNotification(message, type) {
  if (notificationShown) return;
  notificationShown = true;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.style = "height: 100px;";
  notification.textContent = message;
  document.getElementById("notifications-container").appendChild(notification);
  setTimeout(() => {
    notification.remove();
    notificationShown = false;
  }, 1500);
}

// Handle authentication errors
document.body.addEventListener("htmx:afterRequest", function (evt) {
  if (evt.detail.pathInfo.requestPath === "/api/cart/items") {
    if (evt.detail.xhr.status === 401) {
      const response = JSON.parse(evt.detail.xhr.response);
      if (response.redirect) {
        window.location.href = response.redirect;
      }
    }
  }
});
