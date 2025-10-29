const ClevertapCheckoutEvents = (() => {
  const sentSteps = new Set();
  let profile = null;

  const initClevertap = () => {
    try {
      const clevertapConfigs = getStorage("clevertapConfigs");

      if (!clevertapConfigs) {
        throw new Error("Clevertap configs not found");
      }

      const { accountID, region, privacy } = clevertapConfigs;

      if (!accountID || !region) {
        throw new Error("Clevertap accountID or region not found");
      }

      const { optOut, useIP } = privacy;

      window.clevertap = window.clevertap || {
        event: [],
        profile: [],
        account: [],
        onUserLogin: [],
        notifications: [],
        privacy: [],
      };

      window.clevertap.account.push({ id: accountID }, region);
      window.clevertap.privacy.push({ optOut, useIP });

      const wzrk = document.createElement("script");
      wzrk.type = "text/javascript";
      wzrk.async = true;
      wzrk.src =
        (document.location.protocol === "https:"
          ? "https://d2r1yp2w7bby2u.cloudfront.net"
          : "http://static.clevertap.com") + "/js/clevertap.min.js";
      const s = document.getElementsByTagName("script")[0];
      s.parentNode?.insertBefore(wzrk, s);

      return true;
    } catch (error) {
      console.error("Error initializing Clevertap:", error);
      throw error;
    }
  };

  const observeProfileUpdates = () => {
    $(window).on("orderFormUpdated.vtex", function (evt, orderForm) {
      initClevertapProfile(orderForm);
    });
  };

  function initClevertapProfile(orderForm) {
    try {
      const { clientProfileData } = orderForm;

      if (!clientProfileData) return;

      const { email, firstName, lastName, phone } = clientProfileData;

      if (!email || !firstName || !lastName || !phone) return;

      const newProfile = {
        name: `${firstName} ${lastName}`,
        email,
        phone,
        identity: email,
      };

      if (profile && isSameObject(profile, newProfile)) return;

      profile = newProfile;

      window.clevertap?.onUserLogin.push({
        Site: {
          Name: profile.name,
          Email: profile.email,
          Phone: profile.phone,
          Identity: profile.identity,
          "MSG-email": false,
          "MSG-push": true,
          "MSG-sms": true,
          "MSG-whatsapp": true,
        },
      });

      window.clevertap?.getLocation();
    } catch (err) {
      console.error("Erro ao inicializar CleverTap profile:", err);
    }
  }

  const observeDataLayerEvents = () => {
    window.dataLayer = window.dataLayer || [];
    const originalPush = window.dataLayer.push;

    window.dataLayer.push = function (e) {
      try {
        if (e && e.event) {
          sendEnhancedCheckoutEvents(e);
        }
      } finally {
        return originalPush.apply(window.dataLayer, arguments);
      }
    };
  };

  function sendEnhancedCheckoutEvents(e) {
    console.log("Debug CleverTap: detected dataLayer event:", e);
    const ecommerceHandler = ecommerceEventHandlers[e.event];
    const defaultHandler = defaultEventHandlers[e.event];

    if (ecommerceHandler) {
      ecommerceHandler(e.ecommerce);
    }

    if (defaultHandler) {
      defaultHandler(e);
    }
  }

  const ecommerceEventHandlers = {
    add_to_cart: addToCart,
    remove_from_cart: removeFromCart,
    view_cart: viewCart,
    begin_checkout: beginCheckout,
    add_payment_info: addPaymentInfo,
  };

  const defaultEventHandlers = {
    email: checkouStepViewed,
    profile: checkouStepViewed,
    shipping: checkouStepViewed,
    payment: checkouStepViewed,
  };

  async function addToCart(eventData) {
    if (!verifyEvent("add_to_cart")) return;

    const eventName = "Product Added To Cart";
    const orderForm = await getOrderForm();

    if (!orderForm) return;

    const { orderFormId } = orderForm;

    const {
      items: [
        {
          productId,
          skuId,
          category,
          name,
          brand,
          ean,
          price,
          quantity,
          detailUrl,
          imageUrl,
        },
      ],
    } = eventData;

    const data = {
      context: "checkout/cart",
      cart_id: orderFormId,
      product_id: productId,
      sku: skuId,
      category,
      name,
      brand,
      variant: ean,
      price,
      quantity,
      url: detailUrl,
      image_url: imageUrl,
    };

    sendCleverTapEvent(eventName, data);
  }

  async function removeFromCart(eventData) {
    if (!verifyEvent("remove_from_cart")) return;

    const eventName = "Product Removed From Cart";
    const orderForm = await getOrderForm();

    if (!orderForm) return;

    const { orderFormId } = orderForm;

    const {
      items: [
        {
          productId,
          skuId,
          category,
          name,
          brand,
          ean,
          price,
          quantity,
          detailUrl,
          imageUrl,
        },
      ],
    } = eventData;

    const data = {
      context: "checkout/cart",
      cart_id: orderFormId,
      product_id: productId,
      sku: skuId,
      category,
      name,
      brand,
      variant: ean,
      price,
      quantity,
      url: detailUrl,
      image_url: imageUrl,
    };

    sendCleverTapEvent(eventName, data);
  }

  async function viewCart(eventData) {
    if (!verifyEvent("view_cart")) return;

    const eventName = "Cart Viewed";
    const orderForm = await getOrderForm();

    if (!orderForm) return;

    const { orderFormId, marketingData } = orderForm;
    const { items: eventDataItems } = eventData;

    const totalItems = eventDataItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalValue = eventDataItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0
    );

    const data = {
      context: "checkout/cart",
      cart_id: orderFormId,
      value: totalValue,
      items_qty: totalItems,
      coupon: marketingData?.coupon,
    };

    sendCleverTapEvent(eventName, data);
  }

  async function beginCheckout(eventData) {
    if (!verifyEvent("begin_checkout")) return;

    const eventName = "Checkout Started";
    const orderForm = await getOrderForm();

    if (!orderForm) return;

    const { orderFormId, totalizers } = orderForm;

    const taxValue = getTotalizerValue(totalizers, "Tax");
    const itemsValue = getTotalizerValue(totalizers, "Items");
    const discountsValue = getTotalizerValue(totalizers, "Discounts");
    const shippingValue = getTotalizerValue(totalizers, "Shipping");

    const { currency, coupon, value } = eventData;

    const data = {
      order_id: orderFormId,
      value: value,
      revenue: itemsValue,
      shipping: shippingValue,
      tax: taxValue,
      discount: discountsValue,
      coupon,
      currency,
    };

    sendCleverTapEvent(eventName, data);
  }

  async function addPaymentInfo(eventData) {
    if (!verifyEvent("add_payment_info")) return;

    const eventName = "Payment info";
    const orderForm = await getOrderForm();

    if (!orderForm) return;

    const { orderFormId } = orderForm;
    const { payment_type } = eventData;

    const data = {
      checkout_id: orderFormId,
      payment_method: payment_type,
    };

    sendCleverTapEvent(eventName, data);

    checkouStepCompleted(orderFormId, "after-payment");
  }

  function checkouStepViewed(eventData) {
    if (!verifyEvent("checkout_step_viewed")) return;

    const eventName = "Checkout Step Viewed";

    const { orderFormId, event } = eventData;

    const data = {
      checkout_id: orderFormId,
      step: event,
    };

    sendCleverTapEvent(eventName, data);

    if (event !== "email") checkouStepCompleted(orderFormId, event);
  }

  function checkouStepCompleted(orderFormId, event) {
    const eventName = "Checkout Step Completed";

    const stepMap = {
      profile: 1,
      shipping: 2,
      payment: 3,
      "after-payment": 4,
    };

    const allSteps = ["email", "profile", "shipping", "payment"];
    const stepsToSend = allSteps.slice(0, stepMap[event] || 0);

    stepsToSend.forEach((step) => {
      if (!sentSteps.has(step)) {
        sentSteps.add(step);
        sendCleverTapEvent(eventName, {
          checkout_id: orderFormId,
          step,
        });
      }
    });
  }

  function observeRequests() {
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        try {
          if (this.responseURL.includes("/coupons")) {
            const body = JSON.parse(args[0]);
            const data = JSON.parse(this.responseText);

            if (!body || !data) return;

            const { orderFormId, marketingData } = data;
            const coupon = marketingData?.coupon;
            const textValue = body.text;
            const applied = this.status === 200 && coupon;
            const denied = this.status === 200 && textValue && !coupon;

            if (applied) {
              couponApplied(orderFormId, coupon);
            } else if (denied) {
              couponDenied(orderFormId, textValue);
            }
          }
        } catch (err) {
          console.error("Erro ao parsear response do coupon:", err);
        }
      });

      return originalSend.apply(this, args);
    };
  }

  function couponApplied(orderFormId, coupon) {
    if (!verifyEvent("coupon_applied")) return;

    const eventName = "Coupon Applied";

    const data = {
      checkout_id: orderFormId,
      coupon,
    };

    sendCleverTapEvent(eventName, data);
  }

  function couponDenied(orderFormId, textValue) {
    if (!verifyEvent("coupon_denied")) return;

    const eventName = "Coupon Denied";

    const data = {
      checkout_id: orderFormId,
      coupon: textValue,
    };

    sendCleverTapEvent(eventName, data);
  }

  function sendCleverTapEvent(eventName, eventData) {
    window.clevertap?.event.push(eventName, eventData);
  }

  function getOrderForm() {
    return new Promise((resolve, reject) => {
      vtexjs.checkout.getOrderForm().done(resolve).fail(reject);
    });
  }

  function isSameObject(p1, p2) {
    return JSON.stringify(p1) === JSON.stringify(p2);
  }

  const getStorage = (key) => {
    try {
      const value = localStorage.getItem(key);
      console.log(`Debug Retrieved "${key}" from localStorage:`, value);
      if (!value) return null;
      console.log(`Debug Parsed "${key}" from localStorage:`, JSON.parse(value));
      return JSON.parse(value);
    } catch (e) {
      console.error(`Error reading or parsing "${key}" from localStorage`, e);
      return null;
    }
  };

  function getTotalizerValue(totalizers, id) {
    const value = totalizers?.find((t) => t.id === id)?.value ?? 0;
    return formatCurrencyValue(value);
  }

  function formatCurrencyValue(value) {
    return Number((value / 100).toFixed(2));
  }

  function verifyEvent(eventName) {
    const clevertapConfigs = getStorage("clevertapConfigs");
    console.log("Debug CleverTap configs from storage:", clevertapConfigs);

    let config = null;

    if (clevertapConfigs) {
      try {
        config = JSON.parse(clevertapConfigs);
        console.log("Debug CleverTap config parsed successfully:", config);
      } catch (e) {
        console.error("CleverTap: failed to parse config from localStorage", e);
      }
    }

    if (!config || !config.preferences || !config.preferences.trackEvents) {
      console.error("CleverTap: no valid configuration found.");

      return false;
    }

    const { trackEvents } = config.preferences;

    return !!trackEvents[eventName];
  }

  const init = () => {
    const isInitialized = initClevertap();

    if (!isInitialized) return;

    observeProfileUpdates();
    observeDataLayerEvents();
    observeRequests();
  };

  return {
    init,
  };
})();

ClevertapCheckoutEvents.init();
